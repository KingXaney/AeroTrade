// Daily puzzles: probability. See types.ts for the rules every puzzle keeps.

import type {PuzzleCopy} from "@/lib/learn/copy/puzzles/types";

export const PROBABILITY_PUZZLES: readonly PuzzleCopy[] = [
    {
        id: 'two-dice-seven',
        title: 'Lucky seven',
        category: 'probability',
        difficulty: 1,
        prompt: ['Two fair six-sided dice are rolled.', 'What is the probability that they add up to 7?'],
        answer: '1/6',
        hints: ['Count the ordered pairs: there are 36 equally likely outcomes.', 'For every first die there is exactly one second die that makes 7.'],
        solution: ['Each of the six values of the first die has exactly one partner that makes 7: (1,6), (2,5) … (6,1).', 'So 6 of the 36 outcomes work, and 6/36 = 1/6.'],
    },
    {
        id: 'at-least-one-six',
        title: 'Four rolls, one six',
        category: 'probability',
        difficulty: 1,
        prompt: ['A fair die is rolled four times.', 'What is the probability that at least one roll is a six?'],
        answer: '671/1296',
        hints: ['"At least one" is easier through its opposite: no sixes at all.', 'Each roll misses a six with probability 5/6, and the rolls are independent.'],
        solution: ['The chance of no six in four rolls is (5/6)^4 = 625/1296.', 'So at least one six has probability 1 − 625/1296 = 671/1296, about 51.8%.'],
    },
    {
        id: 'two-children',
        title: 'Two children',
        category: 'probability',
        difficulty: 2,
        prompt: [
            'A family has two children, each equally likely to be a boy or a girl, independently.',
            'You learn that at least one of them is a girl. What is the probability that both are?',
        ],
        answer: '1/3',
        hints: ['List the four equally likely families in birth order: BB, BG, GB, GG.', 'The news rules out only one of the four.'],
        solution: ['"At least one girl" leaves BG, GB and GG, still equally likely.', 'Only GG has two girls, so the probability is 1/3, not 1/2.'],
    },
    {
        id: 'shared-birthday',
        title: 'Twenty-three people',
        category: 'probability',
        difficulty: 2,
        prompt: [
            'Twenty-three people are in a room. Birthdays are spread evenly over 365 days, with no leap days.',
            'What is the probability that at least two of them share a birthday? Three decimals, or a percent, is close enough.',
        ],
        answer: '0.507',
        tolerance: 0.005,
        hints: ['Work out the chance that all 23 birthdays are different, then subtract it from 1.', 'The k-th person avoids the earlier birthdays with probability (365 − k + 1)/365.'],
        solution: [
            'All different: (365/365) × (364/365) × … × (343/365), which is about 0.4927.',
            'So a shared birthday has probability about 1 − 0.4927 = 0.507: more likely than not with only 23 people, because they make 253 pairs.',
        ],
    },
    {
        id: 'three-cards',
        title: 'The two-faced card',
        category: 'probability',
        difficulty: 2,
        prompt: [
            'A bag holds three cards: one red on both sides, one white on both sides, one red on one side and white on the other.',
            'You draw a card at random and lay it down; the face up is red. What is the probability that the other side is red too?',
        ],
        answer: '2/3',
        hints: ['Count red faces, not cards.', 'There are three red faces you could be looking at.'],
        solution: [
            'The three red faces are equally likely to be the one showing. Two of them belong to the red-red card.',
            'So the other side is red with probability 2/3.',
        ],
    },
    {
        id: 'three-doors',
        title: 'Three doors',
        category: 'probability',
        difficulty: 2,
        prompt: [
            'A prize sits behind one of three doors. You pick a door. The host, who knows where the prize is, always opens one of the other two doors to show it is empty, then offers a switch.',
            'If you always switch, what is the probability that you win the prize?',
        ],
        answer: '2/3',
        hints: ['Your first pick is right one time in three.', 'Switching wins exactly when your first pick was wrong.'],
        solution: [
            'The first pick is wrong with probability 2/3. Then the host must open the other empty door, and the switch lands on the prize.',
            'So switching wins with probability 2/3; staying wins only 1/3.',
        ],
    },
    {
        id: 'after-the-first-ace',
        title: 'After the first ace',
        category: 'probability',
        difficulty: 3,
        prompt: [
            'A standard 52-card deck is shuffled well and dealt face up one card at a time.',
            'What is the probability that the card right after the first ace is the ace of spades?',
        ],
        answer: '1/52',
        hints: ['Take the ace of spades out and shuffle the other 51 cards.', 'Now put the ace of spades back in a random place: where must it go?'],
        solution: [
            'Shuffle the other 51 cards and insert the ace of spades at one of 52 equally likely places.',
            'It lands right after the first of the other three aces in exactly one of them, so the answer is 1/52 — the same as for any named card.',
        ],
    },
    {
        id: 'matching-socks',
        title: 'A matching pair',
        category: 'probability',
        difficulty: 1,
        prompt: ['A drawer holds 4 red socks and 4 blue socks. You take out two at random.', 'What is the probability that they match?'],
        answer: '3/7',
        hints: ['Whatever the first sock is, 7 socks are left.', 'Three of those seven match the first one.'],
        solution: ['After the first sock, 3 of the remaining 7 share its colour.', 'So the pair matches with probability 3/7.'],
    },
    {
        id: 'broken-stick',
        title: 'A stick in three',
        category: 'probability',
        difficulty: 3,
        prompt: [
            'A stick is broken at two points chosen uniformly at random along its length.',
            'What is the probability that the three pieces can form a triangle?',
        ],
        answer: '1/4',
        hints: ['Three lengths form a triangle when each is shorter than half the stick.', 'Picture the two break points as a point in a unit square and shade where every piece is under 1/2.'],
        solution: [
            'Every piece must be shorter than half the stick. In the unit square of break points, that region is two small triangles.',
            'Together they cover a quarter of the square, so the probability is 1/4.',
        ],
    },
    {
        id: 'hh-against-th',
        title: 'Heads-heads or tails-heads',
        category: 'probability',
        difficulty: 3,
        prompt: [
            'A fair coin is flipped until either heads-heads or tails-heads appears as two flips in a row.',
            'What is the probability that heads-heads appears first?',
        ],
        answer: '1/4',
        hints: ['What happens once a single tails has been flipped?', 'After a tails, the next heads completes tails-heads before heads-heads can.'],
        solution: [
            'Heads-heads can only come first if the first two flips are both heads: probability 1/4.',
            'Any tails before that hands the race to tails-heads, because the first heads after it completes tails-heads.',
        ],
    },
    {
        id: 'three-heads-in-a-row',
        title: 'A run of three',
        category: 'probability',
        difficulty: 3,
        prompt: ['A fair coin is flipped 10 times.', 'What is the probability of at least three heads in a row somewhere in the sequence?'],
        answer: '65/128',
        hints: [
            'Count the sequences with no run of three heads; call the count for n flips a(n).',
            'Such a sequence ends in T, TH or THH after a shorter one, so a(n) = a(n − 1) + a(n − 2) + a(n − 3).',
        ],
        solution: [
            'With a(0) = 1, a(1) = 2 and a(2) = 4, the rule gives 7, 13, 24, 44, 81, 149, 274 and a(10) = 504.',
            'So 1024 − 504 = 520 of the 1024 sequences have a run of three, and 520/1024 = 65/128, about 50.8%.',
        ],
    },
    {
        id: 'positive-test',
        title: 'A positive test',
        category: 'probability',
        difficulty: 2,
        prompt: [
            'One person in a hundred has a condition. A test flags 99% of people who have it, and 5% of people who do not.',
            'A person picked at random tests positive. What is the probability they have the condition?',
        ],
        answer: '1/6',
        hints: ['Imagine 10,000 people and count the positives of each kind.', 'True positives: 100 × 0.99. False positives: 9,900 × 0.05.'],
        solution: [
            'Of 10,000 people, 99 test positive and have it; 495 test positive and do not.',
            'So a positive result means the condition with probability 99/594 = 1/6, about 17% — the false positives outnumber the true ones.',
        ],
    },
];
