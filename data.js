// ============================================================
// THREAT LIFT — workout data
// Days are keyed 1–7 (Mon–Sun) to match ISO weekday numbering.
// ============================================================

const WORKOUT_PROGRAM = {
  1: { // Monday
    key: 'push1',
    title: 'PUSH',
    subtitle: 'Chest / Shoulders / Triceps',
    exercises: [
      { id: 'push1-bench',        name: 'Barbell Bench Press',        sets: 4, reps: '5–8' },
      { id: 'push1-incline-db',   name: 'Incline Dumbbell Press',     sets: 3, reps: '8–10' },
      { id: 'push1-fly',          name: 'Machine or Cable Chest Fly', sets: 3, reps: '12–15' },
      { id: 'push1-shoulder',     name: 'Seated Dumbbell Shoulder Press', sets: 3, reps: '8–10' },
      { id: 'push1-lateral',      name: 'Dumbbell Lateral Raises',    sets: 3, reps: '12–15' },
      { id: 'push1-tricep',       name: 'Cable Tricep Pushdowns',     sets: 3, reps: '10–12' },
    ],
  },
  2: { // Tuesday
    key: 'pull',
    title: 'PULL',
    subtitle: 'Back / Biceps',
    exercises: [
      { id: 'pull-pullup',   name: 'Pull-ups or Lat Pulldown', sets: 4, reps: '6–10' },
      { id: 'pull-row',      name: 'Barbell Rows',             sets: 3, reps: '8–10' },
      { id: 'pull-cablerow', name: 'Seated Cable Rows',         sets: 3, reps: '10–12' },
      { id: 'pull-facepull', name: 'Face Pulls',                sets: 3, reps: '12–15' },
      { id: 'pull-preacher', name: 'Preacher Curl',             sets: 3, reps: '10–12' },
      { id: 'pull-hammer',   name: 'Hammer Curls',              sets: 3, reps: '10–12' },
    ],
  },
  3: { // Wednesday
    key: 'legs',
    title: 'LEGS',
    subtitle: 'Quads / Hamstrings / Calves',
    exercises: [
      { id: 'legs-squat',    name: 'Barbell Squats',        sets: 4, reps: '5–8' },
      { id: 'legs-press',    name: 'Leg Press',              sets: 3, reps: '10–12' },
      { id: 'legs-rdl',      name: 'Romanian Deadlift',      sets: 3, reps: '8–10' },
      { id: 'legs-curl',     name: 'Leg Curl Machine',       sets: 3, reps: '10–12' },
      { id: 'legs-ext',      name: 'Leg Extension',          sets: 3, reps: '12–15' },
      { id: 'legs-calf',     name: 'Standing Calf Raises',   sets: 4, reps: '12–15' },
    ],
  },
  4: { // Thursday
    key: 'upper',
    title: 'UPPER',
    subtitle: 'Chest / Back / Arms',
    exercises: [
      { id: 'upper-incline',  name: 'Incline Bench Press',              sets: 4, reps: '6–10' },
      { id: 'upper-pullup',   name: 'Pull-ups or Lat Pulldown',         sets: 3, reps: '8–10' },
      { id: 'upper-csrow',    name: 'Chest Supported Rows',             sets: 3, reps: '8–10' },
      { id: 'upper-lateral',  name: 'Dumbbell Lateral Raises',          sets: 3, reps: '12–15' },
      { id: 'upper-tricep',   name: 'Cable Tricep Pushdowns',           sets: 3, reps: '10–12' },
      { id: 'upper-ezcurl',   name: 'EZ Bar Curls',                     sets: 3, reps: '10–12' },
    ],
  },
  5: { // Friday
    key: 'lower',
    title: 'LOWER',
    subtitle: 'Posterior Chain / Legs',
    exercises: [
      { id: 'lower-deadlift', name: 'Deadlifts',                       sets: 3, reps: '5' },
      { id: 'lower-front',    name: 'Front Squat or Hack Squat',       sets: 3, reps: '6–8' },
      { id: 'lower-lunge',    name: 'Walking Lunges',                  sets: 3, reps: '10 each leg' },
      { id: 'lower-curl',     name: 'Leg Curl Machine',                sets: 3, reps: '10–12' },
      { id: 'lower-calf',     name: 'Calf Raises',                     sets: 4, reps: '12–15' },
    ],
  },
  6: { // Saturday
    key: 'push2',
    title: 'PUSH II',
    subtitle: 'Chest / Shoulders / Triceps (round 2)',
    exercises: [
      { id: 'push2-bench',        name: 'Barbell Bench Press',        sets: 4, reps: '5–8' },
      { id: 'push2-incline-db',   name: 'Incline Dumbbell Press',     sets: 3, reps: '8–10' },
      { id: 'push2-fly',          name: 'Machine or Cable Chest Fly', sets: 3, reps: '12–15' },
      { id: 'push2-shoulder',     name: 'Seated Dumbbell Shoulder Press', sets: 3, reps: '8–10' },
      { id: 'push2-lateral',      name: 'Dumbbell Lateral Raises',    sets: 3, reps: '12–15' },
      { id: 'push2-tricep',       name: 'Cable Tricep Pushdowns',     sets: 3, reps: '10–12' },
    ],
  },
  7: { // Sunday
    key: 'rest',
    title: 'REST',
    subtitle: 'Recover and eat high protein',
    exercises: [],
  },
};

// Flat list of every trackable exercise, for PR logging / dropdowns.
// De-duplicated by exercise name so "Barbell Bench Press" on Push I and
// Push II share one PR history, etc.
function buildExerciseCatalog() {
  const byName = new Map();
  Object.values(WORKOUT_PROGRAM).forEach(day => {
    day.exercises.forEach(ex => {
      if (!byName.has(ex.name)) {
        byName.set(ex.name, { name: ex.name, ids: [ex.id] });
      } else {
        byName.get(ex.name).ids.push(ex.id);
      }
    });
  });
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

const EXERCISE_CATALOG = buildExerciseCatalog();

const WEEKDAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ISO weekday: Monday = 1 ... Sunday = 7
function isoWeekday(date = new Date()) {
  const d = date.getDay(); // 0 = Sunday
  return d === 0 ? 7 : d;
}
