import type { ConceptPack } from '../../shared/types.js';

export const fluids: ConceptPack = {
  id: 'g8-fluids-floating',
  title: 'Why does a steel ship float?',
  subject: 'Science',
  grade: 8,
  strand: 'Fluids',
  learningGoal:
    'Explain floating and sinking using density: how heavy an object is for its size compared with the fluid it is in.',
  targetAnswer:
    "An object floats when its average density is less than the water's. A steel ship's hollow shape encloses air, so the whole ship is lighter than the water it pushes aside, while a solid nail is denser than water.",
  answerLeakPatterns: [
    'average density (of the ship )?(is|was) (less|lower) than',
    '(less|lower) (average |overall )?density than (the )?water',
    'density (is |that is )?(less|lower) than (the )?water',
    "(ship|boat|it) (is|are) (less dense|lighter) than the (same amount|volume) of water",
    'displaces? (an amount of )?water (equal|that weighs the same)',
    "floats? because (its|the ship'?s?|it has a) (overall |average )?density",
    'air inside (makes|lowers|reduces) (its|the) (overall |average )?density',
    'the answer is',
  ],
  topicKeywords: ['float', 'sink', 'ship', 'boat', 'steel', 'nail', 'water', 'dens', 'heav', 'light', 'weigh', 'mass', 'volume', 'air', 'push', 'buoy', 'shape', 'size', 'hollow', 'clay', 'ball', 'metal', 'iron'],
  keyIdeas: [
    {
      id: 'density',
      text: 'floating depends on how heavy something is for its size (density), not just its weight',
      keywords: [['dens', 'heavy for its size', 'heavy for their size', 'for its size', 'for their size', 'how packed', 'packed together', 'compact', 'per volume', 'mass and volume', 'weight and size', 'size and weight', 'heavy compared to its size']],
    },
    {
      id: 'air',
      text: "a ship's hollow shape holds a lot of air, which makes the whole ship light for its size",
      keywords: [['air', 'hollow', 'empty space', 'empty inside', 'space inside']],
    },
    {
      id: 'push',
      text: 'water pushes up on things, and a wide shape pushes aside more water so more water pushes back',
      keywords: [['push', 'displace', 'buoyan', 'upthrust', 'moves water', 'moves the water', 'more water', 'water out of the way', 'spread out', 'spreads out', 'wider', 'surface area']],
    },
    {
      id: 'compare',
      text: 'it comes down to comparing the object with the same amount of water',
      keywords: [['lighter than', 'heavier than', 'less than', 'more than', 'compared to', 'compare', 'same amount of water', 'same size'], ['water']],
    },
  ],
  misconceptions: [
    {
      id: 'heavy-sinks',
      text: 'Heavy things always sink and light things always float',
      keywords: [['heavy', 'heavier', 'weighs more'], ['sink']],
      probe: 'The ship weighs way more than the nail, though. So can weight alone be the whole story?',
    },
    {
      id: 'metal-sinks',
      text: 'Metal always sinks',
      keywords: [['metal', 'steel', 'iron'], ['always sink', 'sinks', 'sink']],
      probe: "If metal always sinks, what's going on with a steel ship? What's different about it?",
    },
  ],
  stages: {
    hook: {
      goal: 'Spark curiosity and surface first guesses',
      questions: [
        "A giant steel ship weighs thousands of tonnes, but a tiny steel nail sinks straight away. What's your first guess about why?",
        "Think of something you've seen float or sink that surprised you. What was it?",
      ],
      keyIdeaIds: [],
      timeShare: 0.15,
    },
    probe: {
      goal: 'Surface the idea that size matters as well as weight',
      questions: [
        'What do you think decides whether something floats? Is it only how heavy it is?',
        'A beach ball and a bowling ball are about the same size. Why might one float and one sink?',
      ],
      keyIdeaIds: ['density', 'compare'],
      timeShare: 0.25,
    },
    challenge: {
      goal: 'Confront "heavy things sink" with the ship',
      questions: [
        "Some people say heavy things always sink. The ship is much heavier than the nail, so what's different about the ship?",
        'What if we squashed the whole ship into one solid steel ball? What would happen, and why?',
      ],
      keyIdeaIds: ['air', 'push'],
      timeShare: 0.25,
    },
    construct: {
      goal: 'Combine ideas into an explanation',
      questions: [
        "Can you put your ideas together? What is it about the ship's shape and the water that lets it float?",
        'How could we test your idea with a lump of clay and a tub of water?',
      ],
      keyIdeaIds: ['density', 'air', 'push', 'compare'],
      timeShare: 0.2,
    },
    consolidate: {
      goal: 'Each student explains it in their own words',
      questions: ['In your own words, how would you explain to a Grade 5 student why the ship floats but the nail sinks?'],
      keyIdeaIds: ['density', 'air', 'push', 'compare'],
      timeShare: 0.15,
    },
  },
  hints: [
    "What's the same about the ship and the nail, and what's different?",
    "What's inside a ship that isn't inside a nail?",
    'If you compared the ship with a ship-shaped chunk of water, which do you think would be heavier?',
  ],
  harderQuestions: [
    'What if the ship sailed from the salty ocean into a freshwater lake? Would it sit higher or lower in the water, and why?',
    'What if the ship sprang a leak? Can you explain, step by step, why it might sink?',
    'How do you think a submarine can choose to float or sink?',
  ],
  easierQuestions: [
    'Would a big log float or sink? What about a small pebble?',
    'Have you ever tried to push a ball under water? What did you feel?',
  ],
  analogies: [
    "Think about a life jacket. What's it full of, and why might that matter?",
    'Picture a scrunched-up ball of foil and a foil boat. Why might they act differently in water?',
  ],
  fallbackQuestions: [
    "What's one thing you're sure about so far, and one thing you're not sure about?",
    'Who has an idea we have not heard yet?',
    "Which idea from your group do you agree with most? Why?",
  ],
  simLines: {
    hook: [
      'I think the ship floats because it is really big',
      'maybe the nail is pointy so it cuts into the water?',
      'heavy things sink so the nail is heavy for its size i guess',
      'I saw a metal bowl float in the sink once',
    ],
    probe: [
      'I think it is not just weight, it is how heavy it is for its size',
      'the bowling ball is more packed together so it sinks because it is denser',
      'a beach ball is full of air so it is light for its size',
      'it depends on weight and size together',
    ],
    challenge: [
      'the ship is hollow and full of air, so the whole thing is lighter for its size',
      'if you squashed it into a ball it would sink because there is no air inside anymore',
      'the ship pushes a lot of water out of the way and the water pushes back up',
      'I changed my mind, it is not heavy things sink, it is because of the air inside',
    ],
    construct: [
      'the ship is wide so it moves more water, and the water pushes up on it because there is so much of it',
      'we could make a clay ball and a clay boat and see which floats because they weigh the same',
      'so the ship with all the air is lighter than the same amount of water',
    ],
    consolidate: [
      'the nail is solid metal so it is heavy for its size, but the ship has air inside so it floats because it is light for its size',
      'the ship pushes aside lots of water and that water pushes it up, the nail is too small to push enough water so it sinks',
      'it is about density, the ship with air in it is less packed than water so it floats',
    ],
  },
};
