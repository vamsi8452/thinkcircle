import type { ConceptPack } from '../../shared/types.js';

export const water: ConceptPack = {
  id: 'g8-water-salty-ocean',
  title: 'Why is the ocean salty but rain is not?',
  subject: 'Science',
  grade: 8,
  strand: 'Water Systems',
  learningGoal:
    'Explain how the water cycle and rivers make oceans salty while rain stays fresh.',
  targetAnswer:
    'Rivers dissolve tiny amounts of salts and minerals from rocks and carry them to the ocean. When ocean water evaporates, the salt is left behind, so over millions of years the salt builds up, while the evaporated water falls as fresh rain.',
  answerLeakPatterns: [
    'salt (is|gets) left behind (when|as) (the )?(water )?evaporat',
    'evaporation leaves (the )?salt',
    'rivers (carry|bring) (dissolved )?(salt|minerals) (from (the )?rocks )?(in)?to the ocean',
    'salt builds up over (millions of )?years',
    'the answer is',
  ],
  topicKeywords: ['ocean', 'sea', 'salt', 'rain', 'river', 'lake', 'water', 'evaporat', 'cloud', 'rock', 'mineral', 'dissolv', 'fresh', 'cycle', 'condens', 'precipit'],
  keyIdeas: [
    {
      id: 'evaporation',
      text: 'when water evaporates, only the water goes up and the salt stays behind',
      keywords: [['evaporat', 'dries up', 'turns into vapour', 'turns into vapor', 'goes up', 'steam'], ['salt', 'only the water', 'just the water', 'left behind', 'stays']],
    },
    {
      id: 'rivers',
      text: 'rivers pick up tiny bits of salts and minerals from rocks and carry them to the sea',
      keywords: [['river', 'stream', 'rain', 'water'], ['rock', 'ground', 'soil', 'mineral', 'land']],
    },
    {
      id: 'buildup',
      text: 'the ocean is the end of the line, so salt keeps building up over a very long time',
      keywords: [['build', 'collect', 'add up', 'adds up', 'keeps getting', 'pile up', 'piles up', 'accumulat', 'over time', 'long time', 'millions', 'nowhere to go', 'stuck', 'trapped']],
    },
  ],
  misconceptions: [
    {
      id: 'fish',
      text: 'The ocean is salty because of fish or animals',
      keywords: [['fish', 'animal', 'whale', 'pee']],
      probe: 'Lakes have fish too, but most are fresh. So what else could be different about the ocean?',
    },
    {
      id: 'always',
      text: 'The ocean has just always been salty',
      keywords: [['always been', 'just is', 'made that way']],
      probe: 'If salt keeps arriving from somewhere, where do you think it might come from?',
    },
  ],
  stages: {
    hook: {
      goal: 'Spark curiosity',
      questions: [
        'Rain is fresh water, and a lot of rain comes from water that evaporated from the salty ocean. So why is rain not salty?',
        'If rivers are fresh and they flow into the ocean, how did the ocean get so salty?',
      ],
      keyIdeaIds: [],
      timeShare: 0.15,
    },
    probe: {
      goal: 'What happens during evaporation',
      questions: [
        'When a puddle of salty water dries up in the sun, what do you think is left behind?',
        'What do you think actually rises up into the clouds when the ocean evaporates?',
      ],
      keyIdeaIds: ['evaporation'],
      timeShare: 0.25,
    },
    challenge: {
      goal: 'Where does the salt come from?',
      questions: [
        'Some people say the ocean is salty because of fish. Lakes have fish too, so what else could it be?',
        "River water tastes fresh, but could it be carrying something we can't taste? Where would it come from?",
      ],
      keyIdeaIds: ['rivers'],
      timeShare: 0.25,
    },
    construct: {
      goal: 'Combine into an explanation',
      questions: [
        'Can you connect your ideas about rivers and evaporation? What happens to the ocean over a very long time?',
        'How could we test your idea with a cup of salty water and a sunny window?',
      ],
      keyIdeaIds: ['buildup', 'evaporation', 'rivers'],
      timeShare: 0.2,
    },
    consolidate: {
      goal: 'Each student explains it in their own words',
      questions: ['In your own words, how would you explain to a younger student why the ocean is salty but rain is not?'],
      keyIdeaIds: ['evaporation', 'rivers', 'buildup'],
      timeShare: 0.15,
    },
  },
  hints: [
    'What do you think happens to salt when water boils away in a pot?',
    'As rain flows over rocks and soil, what might it pick up along the way?',
    "If something keeps flowing into the ocean but can't leave, what happens to it over time?",
  ],
  harderQuestions: [
    'What if a lake had no river flowing out of it? Would it get salty over time? Why?',
    'Why do you think the Dead Sea is even saltier than the ocean?',
    'What if we wanted drinking water from the ocean? How could we use your idea to get it?',
  ],
  easierQuestions: [
    'Have you ever tasted ocean water or seen salt crust on something at the beach? What was it like?',
    'Where do you think rain comes from?',
  ],
  analogies: [
    'Think of a pot of pasta water that boils for a long time. What happens to how salty it tastes?',
    'Imagine a bathtub where water keeps coming in with a little sand, but only water can leave. What happens to the sand?',
  ],
  fallbackQuestions: [
    "What's one thing you're sure about so far, and one thing you're not sure about?",
    'Who has an idea we have not heard yet?',
    'Which idea from your group do you agree with most? Why?',
  ],
  simLines: {
    hook: [
      'maybe the fish make the ocean salty',
      'I think the salt is too heavy to go up into the clouds',
      'the ocean has just always been salty',
    ],
    probe: [
      'when the puddle dries up the salt is left behind',
      'only the water evaporates, the salt stays because it can not turn into vapour',
    ],
    challenge: [
      'rivers flow over rocks and pick up tiny bits of minerals from the ground',
      'I changed my mind, it is not the fish because lakes have fish too, it is the rocks',
    ],
    construct: [
      'the rivers keep bringing salt and the water evaporates so the salt builds up over a long time',
      'we could leave salty water in the window and see that the salt is left behind because only water evaporates',
    ],
    consolidate: [
      'rain is fresh because only the water evaporates and the salt is left behind, and rivers keep bringing salt from rocks so it builds up',
      'the ocean is salty because the salt has nowhere to go, it piles up over millions of years since only water leaves',
    ],
  },
};
