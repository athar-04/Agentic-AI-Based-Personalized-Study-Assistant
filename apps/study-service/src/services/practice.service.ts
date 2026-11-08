import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '@agentic/shared';
import { SAMPLE_QUIZZES } from '../data/sampleQuizzes';

export class PracticeService {
  listSampleSets() {
    return SAMPLE_QUIZZES.map((s) => ({
      id: s.id,
      title: s.title,
      subject: s.subject,
      description: s.description,
      questionCount: s.questions.length,
      source: 'SAMPLE_BANK' as const,
    }));
  }

  /** Questions without answers: grading happens on the server, so the browser never sees them first. */
  async getSampleSet(quizId: string) {
    await this.ensureSeeded(quizId);
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { order: 'asc' }, select: { id: true, questionText: true, options: true } } },
    });
    if (!quiz) throw new NotFoundError('Practice set');
    return { id: quiz.id, title: quiz.title, subject: quiz.subject, source: 'SAMPLE_BANK' as const, questions: quiz.questions };
  }

  /** A quiz this student may take: a sample set, or an AI quiz generated for them. Answers withheld. */
  async getQuizForUser(userId: string, quizId: string) {
    await this.ensureSeeded(quizId);
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { order: 'asc' }, select: { id: true, questionText: true, options: true } } },
    });
    if (!quiz || !this.mayTake(quiz, userId)) throw new NotFoundError('Quiz');
    return { id: quiz.id, title: quiz.title, subject: quiz.subject, source: quiz.aiGenerated ? ('AI' as const) : ('SAMPLE_BANK' as const), questions: quiz.questions };
  }

  /** AI quizzes belong to the student they were generated for; sample sets are shared. */
  private mayTake(quiz: { aiGenerated: boolean; metadata: Prisma.JsonValue }, userId: string): boolean {
    if (!quiz.aiGenerated) return true;
    const owner = (quiz.metadata as { userId?: unknown } | null)?.userId;
    return owner === userId;
  }

  async submitAttempt(userId: string, quizId: string, answers: { questionId: string; answer: string }[], timeTakenSeconds?: number) {
    await this.ensureSeeded(quizId);
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: { orderBy: { order: 'asc' } } } });
    if (!quiz || !this.mayTake(quiz, userId)) throw new NotFoundError('Practice set');

    const byId = new Map(quiz.questions.map((x) => [x.id, x]));
    const given = new Map<string, string>();
    for (const a of answers) {
      if (!byId.has(a.questionId)) throw new ValidationError('An answer refers to a question that is not in this set');
      given.set(a.questionId, a.answer);
    }

    // Unanswered questions count as wrong, so skipping cannot inflate the score.
    const results = quiz.questions.map((question) => {
      const yourAnswer = given.get(question.id) ?? null;
      return {
        questionId: question.id,
        questionText: question.questionText,
        yourAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect: yourAnswer !== null && yourAnswer === question.correctAnswer,
        explanation: question.explanation,
        marks: question.marks,
      };
    });
    const maxScore = results.reduce((s, r) => s + r.marks, 0);
    const score = results.reduce((s, r) => s + (r.isCorrect ? r.marks : 0), 0);
    const percentage = maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0;

    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        score,
        maxScore,
        percentage,
        timeTaken: timeTakenSeconds,
        responses: {
          create: results
            .filter((r) => r.yourAnswer !== null)
            .map((r) => ({ questionId: r.questionId, userAnswer: r.yourAnswer!, isCorrect: r.isCorrect })),
        },
      },
    });

    return {
      attemptId: attempt.id,
      quizId,
      title: quiz.title,
      score,
      maxScore,
      percentage,
      completedAt: attempt.completedAt.toISOString(),
      results: results.map(({ marks: _marks, ...r }) => r),
    };
  }

  async recentAttempts(userId: string, limit: number) {
    const attempts = await prisma.quizAttempt.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: limit,
      include: { quiz: { select: { title: true, subject: true, aiGenerated: true } } },
    });
    return attempts.map((a) => ({
      id: a.id,
      quizId: a.quizId,
      title: a.quiz.title,
      subject: a.quiz.subject,
      score: a.score,
      maxScore: a.maxScore,
      percentage: a.percentage,
      completedAt: a.completedAt.toISOString(),
      source: a.quiz.aiGenerated ? 'AI' : 'SAMPLE_BANK',
    }));
  }

  /** Creates a sample set on first use. Concurrent first requests race on the fixed id; the loser just reads. */
  private async ensureSeeded(quizId: string) {
    const sample = SAMPLE_QUIZZES.find((s) => s.id === quizId);
    if (!sample) return;
    if (await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true } })) return;
    try {
      await prisma.quiz.create({
        data: {
          id: sample.id,
          title: sample.title,
          subject: sample.subject,
          description: sample.description,
          difficulty: 'BEGINNER',
          aiGenerated: false,
          totalMarks: sample.questions.length,
          metadata: { source: 'SAMPLE_BANK' },
          questions: {
            create: sample.questions.map((x, i) => ({
              id: x.id,
              questionText: x.questionText,
              options: x.options,
              correctAnswer: x.correctAnswer,
              explanation: x.explanation,
              order: i,
              difficulty: 'BEGINNER',
            })),
          },
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }
}
