export type QuizDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type QuestionType = 'MCQ' | 'TRUE_FALSE' | 'FILL_IN_BLANK' | 'SHORT_ANSWER';

export interface QuizDto {
  id: string;
  title: string;
  subject: string;
  description?: string;
  difficulty: QuizDifficulty;
  timeLimit?: number;
  totalMarks: number;
  questionCount: number;
  aiGenerated: boolean;
  createdAt: string;
}

export interface QuestionDto {
  id: string;
  quizId: string;
  type: QuestionType;
  questionText: string;
  options?: string[];
  marks: number;
  difficulty: QuizDifficulty;
  order: number;
}

export interface QuizAttemptDto {
  id: string;
  quizId: string;
  userId: string;
  score: number;
  maxScore: number;
  percentage: number;
  timeTaken?: number;
  completedAt: string;
}

export interface GenerateQuizDto {
  subject: string;
  topic?: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  questionTypes: QuestionType[];
  sourceText?: string;
  documentId?: string;
}
