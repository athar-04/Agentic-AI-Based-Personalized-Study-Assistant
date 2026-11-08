import { randomInt } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthorizationError, NotFoundError, ValidationError } from '@agentic/shared';
import { AiUnavailableError, ChatMessage, chatCompletion, parseJsonReply, streamCompletion } from '../lib/ai';

type TutorInput = { message: string; history?: { role: 'user' | 'assistant'; content: string }[]; topicId?: string };
const TUTOR_OPTIONS = { maxTokens: 900, temperature: 0.4 };

const TUTOR_SYSTEM = [
  'You are a patient, encouraging study tutor helping a student understand their course material.',
  'Explain accurately and step by step, with a short concrete example when it helps.',
  'Keep answers focused: usually under 250 words unless the student asks for more depth.',
  'Use plain text. Short numbered or bulleted lists are fine; avoid tables and heavy formatting.',
  "If you are not sure about something, say so rather than guessing. Never invent sources or facts.",
  'If the question is off-topic, still help briefly and kindly.',
].join(' ');

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(5).max(500),
        options: z.array(z.string().trim().min(1).max(200)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().trim().max(800).optional().default(''),
      }),
    )
    .min(1),
});

const planSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(120),
        description: z.string().trim().max(400).optional(),
        estimatedHours: z.number().min(0.5).max(40).optional(),
        bloomLevel: z.enum(['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE']).optional(),
      }),
    )
    .min(3)
    .max(15),
});

const DIFFICULTY_HINT = {
  BEGINNER: 'introductory: check basic definitions and recall',
  INTERMEDIATE: 'intermediate: check understanding and simple application',
  ADVANCED: 'advanced: require applying and analysing ideas, including short worked reasoning',
  EXPERT: 'expert: demanding multi-step reasoning and subtle distinctions',
} as const;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function ownedTopic(userId: string, topicId: string) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { plan: { select: { userId: true, title: true, subject: true } } },
  });
  if (!topic) throw new NotFoundError('Topic');
  if (topic.plan.userId !== userId) throw new AuthorizationError();
  return topic;
}

/** Asks for JSON and validates it; one retry with the validation problem spelled out, then gives up. */
async function jsonCompletion<T>(messages: ChatMessage[], schema: z.ZodType<T, z.ZodTypeDef, unknown>, maxTokens: number): Promise<T> {
  let lastProblem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs: ChatMessage[] = attempt === 0 ? messages : [...messages, { role: 'user', content: `Your previous reply was not valid (${lastProblem}). Reply again with ONLY the JSON object in the required shape.` }];
    const text = await chatCompletion(msgs, { json: true, maxTokens, temperature: 0.5 });
    try {
      const parsed = schema.safeParse(parseJsonReply(text));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues.slice(0, 2).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } catch {
      lastProblem = 'it was not JSON';
    }
  }
  throw new AiUnavailableError('The AI didn’t produce a usable answer. Please try again.', 'AI_BAD_OUTPUT');
}

export class AiService {
  async tutor(userId: string, input: TutorInput) {
    const reply = await chatCompletion(await this.tutorMessages(userId, input), TUTOR_OPTIONS);
    return { reply };
  }

  /** Streams the answer piece by piece; resolves with the whole text once it's complete. */
  streamTutor(messages: ChatMessage[], onDelta: (text: string) => void, signal?: AbortSignal) {
    return streamCompletion(messages, TUTOR_OPTIONS, onDelta, signal);
  }

  /** Builds the prompt. Throws (404/403) for a topic the student doesn't own, before any AI call. */
  async tutorMessages(userId: string, input: TutorInput): Promise<ChatMessage[]> {
    let context = '';
    if (input.topicId) {
      const topic = await ownedTopic(userId, input.topicId);
      context = ` The student is currently studying "${topic.title}" in their ${topic.plan.subject} plan "${topic.plan.title}".${topic.description ? ` Topic notes: ${topic.description}` : ''} Relate answers to this topic when relevant.`;
    }
    const history = (input.history ?? []).slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    return [{ role: 'system', content: TUTOR_SYSTEM + context }, ...history, { role: 'user', content: input.message }];
  }

  /**
   * Generates a multiple-choice quiz on one of the student's topics (or a typed topic), stores it
   * with its answers, and returns it WITHOUT answers. Grading reuses the server-side practice flow.
   */
  async generateQuiz(
    userId: string,
    input: { topicId?: string; topic?: string; subject?: string; difficulty: keyof typeof DIFFICULTY_HINT; questionCount: number },
  ) {
    let topicTitle = input.topic?.trim() ?? '';
    let subject = input.subject?.trim() || '';
    let notes = '';
    if (input.topicId) {
      const topic = await ownedTopic(userId, input.topicId);
      topicTitle = topic.title;
      subject = topic.plan.subject;
      notes = topic.description ?? '';
    }
    if (!topicTitle) throw new ValidationError('Choose one of your topics or type a topic to be quizzed on.');
    subject ||= topicTitle;
    const n = input.questionCount;

    const { questions } = await jsonCompletion(
      [
        {
          role: 'system',
          content:
            'You write accurate multiple-choice practice questions for students. Every question has exactly 4 options and exactly one correct option. ' +
            'Distractors must be plausible but clearly wrong to someone who understands the material. Explanations say briefly why the answer is right. ' +
            'Reply with ONLY a JSON object: {"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}',
        },
        {
          role: 'user',
          content: `Write ${n} questions on the topic "${topicTitle}" (subject: ${subject}). Level: ${DIFFICULTY_HINT[input.difficulty]}.${notes ? ` Focus notes from the student's plan: ${notes}` : ''} Cover different aspects of the topic; no two questions should test the same fact.`,
        },
      ],
      quizSchema,
      Math.min(4000, 350 * n + 300),
    );

    const usable = questions.filter((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4).slice(0, n);
    if (!usable.length) throw new AiUnavailableError('The AI didn’t produce a usable quiz. Please try again.', 'AI_BAD_OUTPUT');

    const quiz = await prisma.quiz.create({
      data: {
        title: `${topicTitle}: AI practice quiz`,
        subject,
        difficulty: input.difficulty,
        aiGenerated: true,
        totalMarks: usable.length,
        metadata: { source: 'AI', userId, topicId: input.topicId ?? null, model: process.env.AI_MODEL ?? null },
        questions: {
          // Options are shuffled here so the right answer isn't always where the model put it.
          create: usable.map((q, i) => ({
            questionText: q.question,
            options: shuffle(q.options),
            correctAnswer: q.options[q.correctIndex],
            explanation: q.explanation || null,
            order: i,
            difficulty: input.difficulty,
          })),
        },
      },
      include: { questions: { orderBy: { order: 'asc' }, select: { id: true, questionText: true, options: true } } },
    });

    return { id: quiz.id, title: quiz.title, subject: quiz.subject, source: 'AI' as const, topic: topicTitle, questions: quiz.questions };
  }

  /** Suggested topics for a new plan. The student reviews and edits them afterwards. */
  async draftPlanTopics(subject: string, level?: string) {
    const { topics } = await jsonCompletion(
      [
        {
          role: 'system',
          content:
            'You design study plans. Reply with ONLY a JSON object: {"topics":[{"title":"...","description":"one sentence","estimatedHours":2,"bloomLevel":"UNDERSTAND"}]}. ' +
            'bloomLevel is one of REMEMBER, UNDERSTAND, APPLY, ANALYZE, EVALUATE, CREATE. Order topics from foundations to advanced.',
        },
        { role: 'user', content: `Create 6 to 10 study topics for learning "${subject}"${level ? ` at a ${level} level` : ''}.` },
      ],
      planSchema,
      1800,
    );
    return topics;
  }
}
