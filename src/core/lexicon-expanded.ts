import type { Emotion } from './types';

// Original project-authored English vocabulary and heuristic scores, not an
// imported corpus. Inflections are explicit: there is no stemming at runtime.
// Avoid unqualified polysemes such as fine, sound, cold, sick, cheap, or charge.
// Words split on whitespace; phrases split on newlines so their keys are exact.
type Group = readonly [score: number, emotion: Emotion | undefined, terms: string];
const wordGroups: readonly Group[] = [
  [2.3, undefined, `
    admirable admirably admired admiring commendable commendably commend
    commended commending praiseworthy praise praised praising laudable laudably
    laud lauded laudatory meritorious exemplary outstanding superb superbly
    splendid splendidly magnificent magnificently marvelous marvellous
    marvelously marvellously exceptional exceptionally extraordinary
    extraordinarily phenomenal phenomenally stellar terrific terrifically
    fabulous fabulously awesome awesomely delightful delightfully
    breathtaking spectacular spectacularly glorious gloriously
  `],
  [1.8, undefined, `
    appealing alluring attractively attractive charming charm charmed
    enchant enchanting enchanted enchantingly elegant elegantly elegance
    graceful gracefully tasteful tastefully stylish stylishly exquisite
    exquisitely gorgeous gorgeously handsome picturesque radiant radiantly
    vibrant vibrantly expressive expressively refined refinement sophisticated
    sophistication aesthetically beautify beautified beautifying harmonious
    harmoniously immersive engaging engrossing captivating entrancing
    fascinating fascinatingly refreshing refreshingly
  `],
  [1.8, undefined, `
    dependable dependably dependability reliable reliability trustworthy
    trustworthiness durable durability sturdy sturdily sturdiness robust
    robustness resilient resilience flawless flawlessly flawlessness faultless
    faultlessly seamless seamlessly precise precisely precision accurate
    accurately accuracy consistent consistently consistency meticulous
    meticulously thorough thoroughly thoroughness proficient proficiently
    proficiency competent competently competence capable capably craftsmanship
    expertly expertise repairable serviceable reusable maintainable
  `],
  [1.7, undefined, `
    usable usability accessible accessibility convenient conveniently convenience
    effortless effortlessly straightforward navigable legible readable
    comprehensible understandable uncluttered ergonomic ergonomically practical
    practicality functional functionality versatile versatility adaptable
    adaptability compatible compatibility customizable customisable portable
    portability lightweight intuitive intuitively efficient efficiently
    efficiency responsive responsiveness optimized optimised streamlined
    streamlining productive productively productivity effective effectively
    effectiveness beneficial beneficially affordable affordability economical
    economically worthwhile
  `],
  [2, undefined, `
    courteous courteously courtesy polite politely politeness respectful
    respectfully considerate considerately thoughtful thoughtfully
    thoughtfulness attentive attentively attentiveness hospitable hospitably
    hospitality welcoming accommodating supportive sympathetically
    sympathetic empathetic empathy compassionate compassion generously generous
    generosity kindness kindly caring conscientious conscientiously honest
    honestly honesty ethical ethically fairminded sincere sincerely sincerity
    genuine genuinely authentic authenticity
    cooperative cooperatively obliging patiently
  `],
  [2.2, 'joy', `
    joyful joyfully joyous joyously joyousness happiness happily cheerful
    cheerfully cheerfulness cheery merrily merry jubilant jubilantly jubilation
    elated elation ecstatic ecstatically bliss blissful blissfully blissfulness
    gleeful gleefully glee delighted delight delighting delights enjoyment
    enjoyable enjoyably enjoying enjoys adored adore adores adoring affection
    affectionate affectionately fondness grateful gratefully gratitude thankful
    thankfully appreciative appreciatively appreciation contentment satisfied
    satisfaction satisfying gratified gratification fulfilled fulfillment fulfilment
  `],
  [1.8, 'joy', `
    relieved relief reassuring reassured reassurance reassures comforted comforts
    comforting comfortingly consoled consoles consoling encouraged encourages
    encouraging encouragement heartening heartened hopeful hopefully hopefulness
    optimistic optimism optimistically uplifting uplifted uplifts inspired
    inspiring inspiration motivated motivating invigorating invigorated
    invigorates rejuvenated rejuvenating rejuvenates revitalized revitalised
    revitalizing revitalising refreshed energized energised energizing energising
    excited excitement exciting enthusiastically enthusiastic enthusiasm
    eagerly eagerness celebratory celebrating celebrated celebrates celebration
  `],
  [2, undefined, `
    delectable scrumptious mouthwatering appetizing appetising flavorful
    flavourful flavorsome flavoursome deliciously tastier tastiest luscious
    succulent savory savoury nourishing nutritious cozy cosy
    coziness cosiness comfortably cushioned restful relaxing relaxed relaxation
    soothing soothed soothes tranquil tranquility tranquillity peaceful
    peacefully serenity serene serenely therapeutic pampered pampering
    luxuriant luxurious luxuriously opulent sumptuous sumptuously indulgent
    immaculate immaculately spotless spotlessly hygienic hygienically
  `],
  [-2.2, undefined, `
    abysmal abysmally atrocious atrociously appalling appallingly dreadful
    dreadfully horrendous horrendously horrible horribly terrible terribly
    awful awfully lousy wretched wretchedly rotten execrable deplorable
    deplorably unacceptable unacceptably unsatisfactory unsatisfactorily
    inferior inferiority substandard mediocre mediocrity inadequacy inadequate
    inadequately deficient deficiency defective defect defects defectively
    flawed flaws flaw faulty faultily shoddy shoddily shabby shabbily
    flimsy flimsily fragile fragility brittle brittleness
  `],
  [-2, undefined, `
    unreliable unreliability undependable untrustworthy untrustworthiness
    inconsistent inconsistently inconsistency inconsistencies inaccurate
    inaccurately inaccuracy inaccuracies imprecise imprecisely imprecision
    erroneous erroneously malfunction malfunctions malfunctioned
    malfunctioning fails failing failures crashed crashing crashes buggy
    bugginess glitch glitches glitchy laggy lagging sluggish sluggishly
    sluggishness unresponsive unresponsiveness unstable instability freezes
    freezing stutters stuttering corrupted corruption corrupting unusable
    inoperable inoperative irreparable unrepaired unserviceable
  `],
  [-1.8, undefined, `
    cumbersome cumbersomely clumsy clumsily clumsiness clunky clunkiness awkward
    awkwardly awkwardness unwieldy impractical impracticality inefficient
    inefficiently inefficiency ineffective ineffectively ineffectiveness
    unproductive unproductively inaccessible inaccessibility illegible unreadable
    incomprehensible incomprehensibly unintelligible confusing confused confusion
    confusingly convoluted convolutedly unintuitive inconvenient inconvenience
    inconveniently incompatible incompatibility restrictive needlessly redundant
    bloated bloat cluttered clutter overcomplicated overcomplicates
    overcomplication obstructive obtrusive intrusive intrusively disruptive
    disruptively disruption
  `],
  [-2, undefined, `
    overpriced unaffordable unaffordability exorbitant exorbitantly extortionate
    extortionately exploitative exploitation exploitatively wasteful wastefully
    wastefulness worthless worthlessness useless uselessly uselessness pointless
    pointlessly pointlessness futile futility fruitless fruitlessly unrewarding
    disappointing disappoints disappoint disappointed disappointments
    underwhelming underwhelmed underwhelms underperformed underperforms
    underperforming underperformance unsatisfying unfulfilled unfulfilling
    regrettable regrettably regret regrets regretted regretting regretful
    avoidable avoidably unnecessary unnecessarily unrecommended unrecommendable
    unsellable unsalable
  `],
  [-2.3, undefined, `
    rude rudely rudeness discourteous discourteously impolite impolitely
    impoliteness disrespectful disrespectfully disrespect inconsiderate
    inconsiderately thoughtless thoughtlessly thoughtlessness inattentive
    inattentively inattentiveness unhelpful unhelpfully unhelpfulness
    unprofessional unprofessionally unprofessionalism dismissive dismissively
    dismissiveness uncooperative uncooperatively unaccommodating inhospitable
    inhospitably arrogant arrogantly arrogance condescending condescendingly
    patronizing patronising obnoxious obnoxiously obnoxiousness abrasive
    insincere insincerely insincerity dishonest dishonestly dishonesty
    deceitful deceitfully deceit deception deceptive deceptively misleading
  `],
  [-2.3, 'anger', `
    annoyed annoy annoys annoyance annoyances annoyingly irritating irritates
    irritated irritation irritations irritably irritable irritability aggravating
    aggravated aggravates aggravation exasperated exasperating exasperates
    exasperation infuriating infuriated infuriates infuriatingly infuriation
    outraged outrageous outrage outrageously resentful resentfully resentment
    indignant indignantly indignation angered angers angrily furious furiously
    fury enraged enrages enraging enragement livid irate wrathful wrathfully
    wrath incensed affronted affront insulting insulted insults
  `],
  [-2.3, 'sadness', `
    saddened saddening saddens sadness sorrow sorrowful sorrowfully sorrowing
    sorrowed unhappy unhappily unhappiness miserable miserably misery mournful
    mournfully mourning mourns mourned grief grieving grieves grieved
    heartache heartbreak heartbreaking heartbreakingly heartbroken despondent
    despondently despondency dejected dejectedly dejection disheartened
    disheartening disheartens discouraged discouragement discouraging forlorn
    forlornly crestfallen downhearted downcast dispirited dispiriting dispirits
    disconsolate disconsolately inconsolable inconsolably bereaved bereavement
    tearful tearfully weeping wept sobbing
  `],
  [-2, 'fear', `
    fearful fearfully fearfulness fears fearing feared afraid scared scaring
    scares scary scarier scariest frightening frightened frightens fright
    frightful frightfully terrifying terrifies terrified terror terrorized
    terrorised terrorizing terrorising anxious anxiously anxiety anxieties
    worried worries worrying worry worrisome apprehensive apprehensively
    apprehension uneasy uneasily uneasiness unnerved unnerving unnerves
    unsettling unsettled panicked panicking panic panicky petrified petrifying
    intimidated intimidating intimidation dread dreaded dreading dreads
    daunting alarmed alarming alarmingly
  `],
  [-1.8, undefined, `
    unpleasant unpleasantly unpleasantness distasteful distastefully unappealing
    unappetizing unappetising inedible unpalatable tasteless flavorless
    flavourless blandness nauseating nauseated nausea disgusting disgustingly
    disgust disgusted revolting revoltingly repulsive repulsively repellent
    repugnant repugnance repulsed repulsing foul putrid rancid moldy mouldy
    filthy filth dirtiness grimy unhygienic unsanitary squalid squalor smelly
    stinky stench malodorous uncomfortable uncomfortably discomfort painful
    painfully soreness sore aching achy exhausting exhausted exhaustion
    tiresome tiring wearisome draining
  `],
  [-1.7, undefined, `
    boring bored boredom bores tediously tedious tedium monotonous monotonously
    monotony repetitive repetitively dreary drearily dreariness dullness drab
    drabness uninspired uninspiring unimaginative unoriginal banal
    banality vapid vapidity insipid insipidly lifeless joyless cheerless
    humorless humourless charmless graceless gracelessly inelegant inelegantly
    tastelessly unsightly ugly ugliness hideous hideously garish garishly
    tacky tackiness sloppy sloppily sloppiness careless carelessly carelessness
    haphazard haphazardly rushed botched botches bungled bungles bungling
  `],
  [0.8, 'surprise', `
    astonishing astonishingly astonishment astounded astounding astoundingly
    amazement amazed amazes wondrous wondrously awestruck wonderment
    dumbfounded dumbfounding flabbergasted flabbergasting
  `]
];

// Negators inside these keys are already reflected in the authored score.
// Do not construct idioms beginning with contrast markers (but/yet/though),
// because scoreSentiment deliberately handles those before lexical matching.
const phraseGroups: readonly Group[] = [
  [2.3, undefined, `
highly recommend
strongly recommend
wholeheartedly recommend
would recommend
would buy again
would purchase again
would use again
would happily buy again
would gladly buy again
happy with my purchase
pleased with my purchase
worth every penny
worth the price
worth the money
worth the wait
worth buying
worth trying
worth it
money well spent
excellent value for money
great value for money
good value for money
exceeded my expectations
exceeded our expectations
exceeds expectations
better than expected
better than advertised
as good as advertised
lives up to the hype
went above and beyond
goes above and beyond
a pleasure to use
a delight to use
easy to use
easy to understand
easy to navigate
easy to install
easy to set up
simple to use
works as advertised
works as expected
works like a charm
worked like a charm
works out of the box
worked out of the box
worked without a hitch
works without a hitch
without a hitch
no complaints
no hassle
hassle free
trouble free
user friendly
well designed
well made
well built
well crafted
well organized
well organised
well explained
well worth it
well worth the money
well worth the extra money
built to last
quick to respond
prompt and courteous
friendly and helpful
helpful and knowledgeable
service with a smile
superb customer service
outstanding customer service
top notch
first rate
five stars
two thumbs up
gets the job done
delivered on its promises
delivers on its promises
could not be more pleased
couldn't be more pleased
could not be happier
couldn't be happier
does not disappoint
did not disappoint
didn't disappoint
not a single complaint
not disappointed at all
cannot recommend it enough
can't recommend it enough
  `],
  [-2.5, undefined, `
do not recommend
would not recommend
wouldn't recommend
cannot recommend
can't recommend
would not buy again
would never buy again
would not purchase again
would not use again
wouldn't buy again
not worth it
not worth buying
not worth the price
not worth the money
not worth the wait
not worth the trouble
not worth a single penny
not worth the money at all
waste of money
waste of time
waste of effort
money down the drain
time down the drain
poor value for money
terrible value for money
failed to meet expectations
fails to meet expectations
below my expectations
fell below expectations
did not meet my expectations
didn't meet my expectations
does not meet expectations
not as advertised
not as described
nothing like the description
does not work
doesn't work
did not work
didn't work
never worked properly
stopped working
keeps crashing
kept crashing
crashes all the time
broke on the first day
broke after one use
dead on arrival
fell apart
falls apart
falling apart
poorly made
poorly designed
poorly built
poorly explained
poorly packaged
badly made
badly designed
badly damaged
arrived damaged
arrived broken
missing parts
hidden fees
unexpected charges
charged twice
overcharged me
refund refused
refused a refund
no refund
never arrived
never delivered
delivery never arrived
still waiting for a refund
impossible to use
hard to use
difficult to navigate
difficult to set up
pain to use
a chore to use
customer service was unhelpful
customer service was rude
terrible customer service
no customer support
no response from support
left on hold
kept me waiting
gave me the runaround
total letdown
complete letdown
buyer beware
avoid at all costs
never again
leaves much to be desired
left much to be desired
  `],
  [2.6, 'joy', `
over the moon
walking on air
full of joy
filled with joy
brings me joy
made my day
makes my day
put a smile on my face
grinning from ear to ear
bursting with happiness
happy as can be
could not stop smiling
can't stop smiling
couldn't stop smiling
in high spirits
lifted my spirits
lifts my spirits
felt a wave of relief
a huge relief
a weight off my shoulders
at peace with myself
thank you so much
deeply grateful
truly grateful
so glad I bought this
  `],
  [-2.6, 'anger', `
lost my patience
losing my patience
out of patience
at my wits end
drives me crazy
drove me crazy
gets on my nerves
got on my nerves
boils my blood
makes my blood boil
filled with anger
seething with anger
fuming with anger
angry beyond words
sick and tired of this
had enough of this
treated me like dirt
treated us like dirt
insult to injury
utterly fed up
  `],
  [-2.6, 'sadness', `
broke my heart
breaks my heart
breaking my heart
my heart sank
feel so alone
felt so alone
feeling so alone
in low spirits
down in the dumps
lost all hope
losing all hope
filled with sadness
filled with sorrow
reduced to tears
moved to tears of sadness
cannot stop crying
can't stop crying
could not stop crying
left me heartbroken
let me down
  `],
  [-2.5, 'fear', `
scared out of my mind
frightened out of my mind
terrified beyond words
filled with fear
paralyzed with fear
paralysed with fear
shaking with fear
trembling with fear
afraid for my safety
worried sick
worried about my safety
fear for my safety
in a state of panic
on the verge of panic
a sense of dread
filled with dread
scared me senseless
sent chills down my spine
  `],
  [1.2, 'surprise', `
surprised me pleasantly
pleasantly surprised
a wonderful surprise
a delightful surprise
exceeded even my wildest expectations
could not believe my luck
couldn't believe my luck
took my breath away
left me awestruck
in awe of this
  `],
  [-1.8, 'surprise', `
an unpleasant surprise
a nasty surprise
shocked by the poor service
shocked by the hidden fees
caught me off guard in a bad way
  `]
];

/** Kept as tuples so tests can detect accidental repeated authored keys. */
export const expandedEntries: ReadonlyArray<readonly [string, number, Emotion?]> = [
  ...wordGroups.flatMap(([score, emotion, terms]) =>
    terms.trim().split(/\s+/u).map(term => [term, score, emotion] as const)),
  ...phraseGroups.flatMap(([score, emotion, terms]) =>
    terms.trim().split('\n').map(term => [term.trim().toLowerCase(), score, emotion] as const))
];