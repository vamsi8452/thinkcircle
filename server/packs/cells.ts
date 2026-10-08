import type { ConceptPack } from '../../shared/types.js';

export const cells: ConceptPack = {
  id: 'g8-cells-size',
  title: 'Why are cells so tiny?',
  subject: 'Science',
  grade: 8,
  strand: 'Cells',
  learningGoal:
    'Explain why living things are made of many small cells, using the idea that materials must move in and out through the cell membrane.',
  targetAnswer:
    'Small cells have more surface area compared to their volume, so food, oxygen and waste can move in and out through the membrane fast enough. A giant cell would have too little membrane for everything inside it.',
  answerLeakPatterns: [
    'surface area (to|compared to|relative to) (its |their )?volume',
    'more surface (area )?(for|per) (their |its )?(size|volume)',
    '(ratio|proportion) of surface',
    'small cells (have|get) more (membrane|surface)',
    'too little (membrane|surface) for',
    'the answer is',
  ],
  topicKeywords: ['cell', 'tiny', 'small', 'big', 'giant', 'membrane', 'food', 'oxygen', 'waste', 'nutrient', 'surface', 'outside', 'inside', 'volume', 'body', 'diffus', 'move', 'grow', 'divide'],
  keyIdeas: [
    {
      id: 'exchange',
      text: 'cells need food and oxygen to get in, and waste to get out',
      keywords: [['food', 'oxygen', 'nutrient', 'waste', 'water', 'sugar', 'energy'], ['in', 'out', 'enter', 'leave', 'get', 'move', 'through']],
    },
    {
      id: 'membrane',
      text: 'everything has to pass through the outside edge of the cell, its membrane',
      keywords: [['membrane', 'outside', 'edge', 'skin', 'surface', 'wall', 'border']],
    },
    {
      id: 'distance',
      text: 'in a giant cell, the middle would be too far from the edge for things to reach it in time',
      keywords: [['middle', 'center', 'centre', 'far', 'distance', 'too long', 'takes longer', 'reach']],
    },
    {
      id: 'ratio',
      text: 'when a cell gets bigger, the inside grows faster than the outside edge',
      keywords: [['inside', 'volume', 'space', 'stuff inside'], ['faster', 'more than', 'outside', 'edge', 'surface', 'not enough', 'too much']],
    },
  ],
  misconceptions: [
    {
      id: 'no-room',
      text: 'Cells are small just so they fit in the body',
      keywords: [['fit', 'room', 'space in the body']],
      probe: 'An elephant is huge, but its cells are about as small as a mouse’s. Why might that be?',
    },
    {
      id: 'bigger-better',
      text: 'One big cell would be stronger or better',
      keywords: [['bigger', 'big cell'], ['better', 'stronger', 'easier']],
      probe: 'If one giant cell would be better, why do you think living things are not built that way?',
    },
  ],
  stages: {
    hook: {
      goal: 'Spark curiosity',
      questions: [
        'Your body has about 30 trillion cells, and most are too small to see. Why do you think you are not made of a few giant cells instead?',
        'An elephant’s cells are about the same size as a mouse’s. What do you make of that?',
      ],
      keyIdeaIds: [],
      timeShare: 0.15,
    },
    probe: {
      goal: 'Surface what cells need to do',
      questions: [
        'What does a cell need to stay alive? How does that stuff get to it?',
        'Where do food and oxygen have to go to get into a cell?',
      ],
      keyIdeaIds: ['exchange', 'membrane'],
      timeShare: 0.25,
    },
    challenge: {
      goal: 'Imagine a giant cell',
      questions: [
        'Imagine a cell the size of a basketball. What problems might the very middle of it have?',
        'Some people think one big cell would be stronger. What could go wrong with that?',
      ],
      keyIdeaIds: ['distance', 'membrane'],
      timeShare: 0.25,
    },
    construct: {
      goal: 'Build the explanation',
      questions: [
        'If a cell doubled in size, what do you think grows faster: the stuff inside or the outside edge?',
        'How could we use sugar cubes to test your idea about big and small cells?',
      ],
      keyIdeaIds: ['ratio', 'distance', 'membrane'],
      timeShare: 0.2,
    },
    consolidate: {
      goal: 'Each student explains it in their own words',
      questions: ['In your own words, how would you explain to a younger student why cells stay small?'],
      keyIdeaIds: ['exchange', 'membrane', 'distance', 'ratio'],
      timeShare: 0.15,
    },
  },
  hints: [
    'What has to happen for food to get from your blood into a cell?',
    'If something has to come in from the outside, which part of a giant cell gets it last?',
    'When you make a box bigger, what grows faster: the space inside or the cardboard on the outside?',
  ],
  harderQuestions: [
    'What if a cell were long and very thin instead of round? Would that help or hurt, and why?',
    'Why do you think your lungs and intestines have so many folds?',
    'What if a cell could not divide when it grew? What might happen?',
  ],
  easierQuestions: [
    'What do you need every day to stay alive? Do you think cells need some of the same things?',
    'How does food get into your body? Where does it go next?',
  ],
  analogies: [
    'Think of a school with only one tiny door. What happens at lunchtime if the school gets twice as big?',
    'Picture a big pizza and a small one. Which has more crust compared to its middle?',
  ],
  fallbackQuestions: [
    "What's one thing you're sure about so far, and one thing you're not sure about?",
    'Who has an idea we have not heard yet?',
    'Which idea from your group do you agree with most? Why?',
  ],
  simLines: {
    hook: [
      'maybe they are small so they can fit in the body',
      'I think small cells are easier to replace',
      'big cells would be squishy and break',
    ],
    probe: [
      'cells need food and oxygen to get in and waste to get out',
      'stuff has to go through the outside edge of the cell, the membrane',
      'the oxygen comes from the blood and goes in through the membrane',
    ],
    challenge: [
      'the middle of a giant cell would be too far from the edge so food would take too long to reach it',
      'I changed my mind, it is not about fitting, because the middle would be starving',
      'a big cell would need way more food but it only has the same kind of outside',
    ],
    construct: [
      'the inside grows faster than the outside edge so there is not enough membrane',
      'we could cut sugar cubes and see that the small ones dissolve faster because more of them touches the water',
    ],
    consolidate: [
      'cells stay small because food and oxygen have to get through the membrane, and in a big cell the middle would be too far away',
      'when a cell gets bigger the inside grows faster than the outside so there is not enough membrane for everything',
    ],
  },
};
