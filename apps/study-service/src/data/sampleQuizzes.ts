/**
 * A small, hand-written practice bank so quizzes work without the paid AI service.
 * The UI labels these as "Sample practice set — not AI-generated". Scores from them are
 * real (the student's own answers, graded on the server), the questions are not personalised.
 * Ids are fixed so the sets are created once and attempts keep pointing at the same rows.
 */
export interface SampleQuestion {
  id: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface SampleQuiz {
  id: string;
  title: string;
  subject: string;
  description: string;
  questions: SampleQuestion[];
}

const q = (id: string, questionText: string, options: string[], correctAnswer: string, explanation: string): SampleQuestion => ({
  id,
  questionText,
  options,
  correctAnswer,
  explanation,
});

export const SAMPLE_QUIZZES: SampleQuiz[] = [
  {
    id: '7c1e2a40-0000-4000-8000-000000000100',
    title: 'Physics fundamentals',
    subject: 'Physics',
    description: 'Forces, motion, energy and thermodynamics.',
    questions: [
      q('7c1e2a40-0000-4000-8000-000000000101', 'What is the SI unit of force?', ['Joule', 'Newton', 'Watt', 'Pascal'], 'Newton',
        'One newton is the force that accelerates 1 kg at 1 m/s² (1 N = 1 kg·m/s²).'),
      q('7c1e2a40-0000-4000-8000-000000000102', 'An object moves in a straight line at constant velocity. What is the net force on it?',
        ['Zero', 'Equal to its weight', 'Increasing steadily', 'Opposite to its motion'], 'Zero',
        "Newton's first law: with no net force, velocity does not change. Constant velocity means zero net force."),
      q('7c1e2a40-0000-4000-8000-000000000103', 'Approximately what is the acceleration due to gravity near Earth\'s surface?',
        ['1.6 m/s²', '3.7 m/s²', '9.8 m/s²', '98 m/s²'], '9.8 m/s²',
        'Near the surface g ≈ 9.8 m/s². (1.6 m/s² is the Moon, 3.7 m/s² is Mars.)'),
      q('7c1e2a40-0000-4000-8000-000000000104', 'What happens to the total entropy of an isolated system during a spontaneous process?',
        ['It decreases', 'It never decreases', 'It always stays exactly the same', 'It becomes zero'], 'It never decreases',
        'The second law of thermodynamics: the entropy of an isolated system never decreases; it increases in irreversible processes.'),
      q('7c1e2a40-0000-4000-8000-000000000105', 'Which expression gives the kinetic energy of a mass m moving at speed v?',
        ['mv', '½mv²', 'mgh', 'm²v'], '½mv²',
        'Kinetic energy is ½mv². mv is momentum and mgh is gravitational potential energy.'),
    ],
  },
  {
    id: '7c1e2a40-0000-4000-8000-000000000200',
    title: 'Cell biology basics',
    subject: 'Biology',
    description: 'Organelles, DNA and cell division.',
    questions: [
      q('7c1e2a40-0000-4000-8000-000000000201', 'Which organelle produces most of a cell\'s ATP through aerobic respiration?',
        ['Ribosome', 'Golgi apparatus', 'Mitochondrion', 'Lysosome'], 'Mitochondrion',
        'Aerobic respiration\'s Krebs cycle and electron transport chain run in the mitochondria and produce most ATP.'),
      q('7c1e2a40-0000-4000-8000-000000000202', 'In DNA, which base pairs with adenine?',
        ['Cytosine', 'Guanine', 'Thymine', 'Uracil'], 'Thymine',
        'In DNA, A pairs with T and G pairs with C. Uracil replaces thymine in RNA.'),
      q('7c1e2a40-0000-4000-8000-000000000203', 'Where in a plant cell does photosynthesis take place?',
        ['Chloroplast', 'Nucleus', 'Vacuole', 'Cell wall'], 'Chloroplast',
        'Chloroplasts contain chlorophyll and carry out both stages of photosynthesis.'),
      q('7c1e2a40-0000-4000-8000-000000000204', 'Which blood cells mainly carry oxygen around the body?',
        ['White blood cells', 'Platelets', 'Red blood cells', 'Plasma cells'], 'Red blood cells',
        'Red blood cells contain haemoglobin, which binds oxygen in the lungs and releases it in tissues.'),
      q('7c1e2a40-0000-4000-8000-000000000205', 'Which process produces two genetically identical daughter cells?',
        ['Meiosis', 'Mitosis', 'Fertilisation', 'Transcription'], 'Mitosis',
        'Mitosis produces two identical diploid cells. Meiosis produces four genetically different haploid cells.'),
    ],
  },
  {
    id: '7c1e2a40-0000-4000-8000-000000000300',
    title: 'Computer science essentials',
    subject: 'Computer Science',
    description: 'Algorithms, data structures and the web.',
    questions: [
      q('7c1e2a40-0000-4000-8000-000000000301', 'What is the worst-case time complexity of binary search on a sorted array of n items?',
        ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 'O(log n)',
        'Each comparison halves the remaining range, so at most about log₂ n steps are needed.'),
      q('7c1e2a40-0000-4000-8000-000000000302', 'Which data structure is last-in, first-out (LIFO)?',
        ['Queue', 'Stack', 'Heap', 'Linked list'], 'Stack',
        'A stack removes the most recently added item first. A queue is first-in, first-out.'),
      q('7c1e2a40-0000-4000-8000-000000000303', 'Which HTTP status code means "Not Found"?',
        ['200', '301', '404', '500'], '404',
        '404 means the server could not find the requested resource. 500 is a server error.'),
      q('7c1e2a40-0000-4000-8000-000000000304', 'How many bits are in one byte?', ['4', '8', '16', '32'], '8',
        'A byte is 8 bits, which can represent 256 distinct values.'),
      q('7c1e2a40-0000-4000-8000-000000000305', 'Which SQL statement removes rows from a table but keeps the table?',
        ['SELECT', 'DELETE', 'DROP', 'ALTER'], 'DELETE',
        'DELETE removes rows. DROP removes the whole table, and ALTER changes its structure.'),
    ],
  },
];
