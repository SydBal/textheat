import type { Emotion } from './types';

type Entry = readonly [key: string, score: number, emotion?: Emotion];
type Group = readonly [score: number, emotion: Emotion | undefined, terms: string];
type ReviewFamily = readonly [subjects: string, praise: string, criticism: string];
const lines = (text: string): string[] => text.trim().split('\n').map(line => line.trim());

// Original authored lists, not a corpus or imported dictionary. Each family is
// a deliberately restricted compatibility set: every predicate makes sense for
// every subject in that family. Expand one local past-tense opinion frame only,
// not an unrestricted adjective/noun product or paraphrase multiplication.
// No stemming: spelling variants and inflections below are explicitly authored.
const wordGroups: readonly Group[] = [
  [2, undefined, `
    commendation commendations commendatory creditable creditably estimable
    estimably laudation laudations superlatively unsurpassed
    peerless peerlessly matchless matchlessly unsurpassable
    consummately impeccable impeccably impeccability faultlessness
    irreproachable irreproachably unblemished unexcelled unequalled unequaled
    recommendable recommend recommended recommends
    recommending recommendation recommendations recommendability
  `],
  [1.8, undefined, `
    welcomingly neighborly neighbourly neighborliness neighbourliness
    collegial collegially collegiality collaborative collaboratively
  `],
  [1.8, undefined, `
    candidly candidness forthright forthrightly forthrightness scrupulous
    scrupulously scrupulousness principled incorruptible incorruptibility
    equitable equitably equitability impartial impartially impartiality
    nondiscriminatory inclusive inclusively inclusiveness inclusivity
    nondiscrimination nonjudgmental nonjudgemental nonjudgmentally
    nonjudgementally altruistic altruistically altruism magnanimous
    magnanimously magnanimity benevolent benevolently benevolence
    beneficent beneficently beneficence humane humanely humaneness
  `],
  [1.7, undefined, `
    conscientiousness considerateness cooperativeness accommodatingly
    approachability approachable approachably affable affably affability
    amiable amiably amiability cordial cordially cordiality genial genially
    geniality personable personably obligingly obligingness gracious
    graciously graciousness tactful tactfully tactfulness
    diplomatically solicitous solicitously solicitousness encouragingly
    reassuringly consolingly hearteningly upliftingly empathic empathically
  `],
  [1.8, undefined, `
    serviceability maintainability reparability reparable reparably
    repairability customizability customisability configurability configurable
    interoperable interoperability extensible extensibility upgradeable
    upgradable upgradeability upgradability discoverable discoverability
    learnable learnability navigability comprehensibility understandability
    legibility readability intuitiveness ergonomics unobtrusive unobtrusively
    unobtrusiveness resourceful resourcefully resourcefulness
    inventiveness inventive inventively ingenious ingeniously ingenuity
  `],
  [1.9, undefined, `
    palatable palatably palatability appetizingly appetisingly delectably
    scrumptiously succulently succulence savoriness savouriness lusciousness
    lusciously nourishingly wholesomeness wholesome wholesomely
    cozily cosily snugness snugly restfully restfulness soothingly
    placidly placidity rejuvenation
    revitalization revitalisation invigoration invigoratingly restorative
  `],
  [2.2, 'joy', `
    felicity felicitous felicitously exultant exultantly exultation exult
    exults exulted exulting rapturous rapturously rapture euphoric
    euphorically euphoria ebullient ebulliently ebullience buoyantly
    lighthearted lightheartedly lightheartedness exhilarated exhilarating
    exhilaration exhilarates exhilarate jubilance
    gladness gladsome gladsomely gladdened gladdening gladdens gladden
    felicitation felicitations rejoicing rejoiced rejoices rejoice
  `],
  [-2.2, undefined, `
    inept ineptly ineptitude incompetence incompetent incompetently
    incapable incapably incapability ineffectual ineffectually ineffectuality
    inefficiencies inadequacies deficiencies defectiveness faultiness
    unreliably untrustworthily undependability
    unmaintainable unrepairable irreparably irremediable irremediably
    unrecoverable unrecoverably irrecoverable irrecoverably
    unconfigurable unnavigable undiscoverable undecipherable undecipherably
    indecipherable indecipherably unreadability illegibility
  `],
  [-2.4, undefined, `
    unscrupulous unscrupulously unscrupulousness unethical unethically
    inequitable inequitably inequity inequities unjust unjustly injustice
    injustices unfair unfairly unfairness discriminatorily
    discriminatory discrimination prejudicial prejudicially prejudiced
    bigoted bigotry coercive coercively coercion fraud fraudulent
    fraudulently fraudulence frauds scam scams scammed scamming scammer
    scammers swindle swindles swindled swindling swindler swindlers
    duplicitous duplicitously duplicity underhanded underhandedly
  `],
  [-2, undefined, `
    callous callously callousness uncaring unkind unkindly unkindness
    uncharitable uncharitably uncharitableness ungracious ungraciously
    ungraciousness tactless tactlessly tactlessness insensitive insensitively
    insensitivity unsympathetic unsympathetically unempathetic heartless
    heartlessly heartlessness pitiless pitilessly pitilessness merciless
    mercilessly mercilessness spiteful spitefully spitefulness vindictive
    vindictively vindictiveness malicious maliciously malice meanhearted
    belittling belittled belittles belittle disparaging disparaged disparages
    disparage disparagingly denigrating denigrated denigrates denigrate
  `],
  [-2, undefined, `
    noisily noisiness deafening deafeningly earache earaches unsavoriness
    unsavouriness unpalatability unpalatably nauseatingly nauseous
    nauseously noisome noisomely noisomeness fetid fetidness mustiness
    uncleanliness unclean uncleanly unhygienically unsanitarily
    uninhabitable unlivable unliveable unwelcoming unwelcomingly
    discomforting discomforted discomforts discomfortingly
    fatiguing fatigued fatigue fatigues onerous onerously onerousness
    burdensome burdensomely burdensomeness
  `],
  [-2.3, 'anger', `
    vexed vexing vexation vexations vex vexes vexatious vexatiously
    vexatiousness chagrin chagrined chagrining chagrins ire ireful
    irascible irascibly irascibility irateness peevish peevishly peevishness
    irked irks irking irksome irksomely irksomeness nettled
    nettling nettlesome rankled rankles rankling rankle rancorous
    rancorously rancor rancour embittered embittering embitters embitter
  `],
  [-2.2, 'sadness', `
    doleful dolefully dolefulness woeful woefully woefulness woebegone
    woebegoneness sorrowfulness mournfulness melancholic melancholy
    melancholically wistful wistfully wistfulness dismal dismally
    dismalness disheartenment dispiritedly dispiritedness
    forlornness hopeless hopelessly hopelessness despondence disconsolation
    inconsolability heartsick heartsickness disillusioned disillusioning
    disillusionment disillusion disillusions demoralized demoralised
    demoralizing demoralising demoralization demoralisation
  `],
  [-2.2, 'fear', `
    trepidation trepidations apprehensiveness fretful fretfully fretfulness
    disquiet disquieted disquieting disquiets
    disquietingly disquietude jittery jitteriness nervously nervousness
    consternation consternations timorous timorously timorousness
    terrorizes terrorises petrifies frightfulness
  `]
];

// Singular review subjects use "the SUBJECT was PREDICATE". Ambiguous words
// (cold, cheap, sound, fine, charge, sick, etc.) appear only in qualified phrases.
const reviewFamilies: readonly ReviewFamily[] = [
  // Purchasing and value: price is judged, not assumed emotional on its own.
  [`
purchase
subscription
membership
upgrade
replacement
repair
booking
meal deal
gift set
service package
`, `
worth the asking price
excellent value for my budget
worth paying extra for
fairly priced for the quality
worth every cent to me
good value compared with alternatives
affordable without sacrificing quality
a purchase i would recommend
`, `
too expensive for the quality
poor value compared with alternatives
not worth the asking price
an expensive disappointment
overpriced for what i received
a waste of my limited budget
not worth paying extra for
priced beyond its actual value
`],
  // The transaction itself, rather than arbitrary billing vocabulary.
  [`
checkout process
ordering process
payment process
renewal process
cancellation process
refund process
return process
exchange process
registration process
booking process
`, `
quick and painless
clearly explained at every step
easy to complete without help
straightforward from start to finish
free of hidden charges
refreshingly simple
convenient and reliable
handled without unnecessary delays
`, `
needlessly complicated
full of unexplained charges
frustrating from start to finish
impossible to complete without help
poorly explained at every step
unreasonably time consuming
confusing and unreliable
burdened with unnecessary delays
`],
  // Service providers: evaluation is explicitly tied to an interaction.
  [`
support agent
customer service representative
repair technician
delivery driver
receptionist
sales assistant
booking agent
help desk operator
service adviser
account manager
`, `
patient with my questions
helpful without being pushy
respectful of my time
courteous throughout our conversation
honest about the available options
attentive to my concerns
kind when i needed help
quick to resolve my complaint
`, `
impatient with my questions
rude throughout our conversation
dismissive of my concerns
pushy about unnecessary purchases
unwilling to explain the options
careless with my request
unhelpful when i needed assistance
disrespectful of my time
`],
  // Physical product construction.
  [`
chair
desk
backpack
suitcase
phone case
storage cabinet
bookshelf
lamp
toolbox
kitchen appliance
`, `
sturdy enough for daily use
beautifully finished
assembled with obvious care
free of sharp edges
durable despite regular use
well built for the price
easy to maintain
thoughtfully designed for everyday use
`, `
flimsy despite the high price
badly assembled
poorly finished
damaged before its first use
full of sharp edges
too fragile for daily use
falling apart after light use
carelessly designed
`],
  // Delivery and fulfilment.
  [`
parcel delivery
grocery delivery
furniture delivery
replacement delivery
gift delivery
meal delivery
flower delivery
medicine delivery
document delivery
equipment delivery
`, `
on time as promised
handled with care
easy to track accurately
delivered to the right address
protected by careful packaging
conveniently scheduled
completed without any hassle
handled courteously
`, `
late without any explanation
sent to the wrong address
handled carelessly
impossible to track accurately
delayed despite repeated promises
damaged by poor packaging
canceled without warning
left in an unsafe location
`],
  // Software learnability and navigation.
  [`
settings menu
search interface
navigation menu
onboarding flow
account dashboard
editing interface
help page
control panel
installation wizard
configuration screen
`, `
easy to understand on first use
clearly labeled
simple to navigate with a keyboard
intuitive without a tutorial
organized around my actual needs
easy to learn at my own pace
free of distracting clutter
designed with beginners in mind
`, `
confusing even after the tutorial
poorly labeled
hard to navigate with a keyboard
cluttered with irrelevant controls
needlessly difficult to learn
organized without regard to my needs
inaccessible without a mouse
overwhelming for a beginner
`],
  // Reliability remains in a technical opinion context.
  [`
backup system
sync service
video player
audio player
search tool
mail application
document editor
calendar application
file manager
notification system
`, `
reliable throughout daily use
stable under heavy use
responsive even with large files
consistent across repeated attempts
quick to recover from interruptions
dependable when i needed it
free of recurring glitches
easy to restore after a failure
`, `
unreliable throughout daily use
unstable under light use
slow even with small files
inconsistent across repeated attempts
unable to recover from interruptions
prone to losing my work
plagued by recurring glitches
impossible to restore after a failure
`],
  // Privacy and control; not all data processing is negative.
  [`
privacy policy
consent form
permission request
data retention policy
tracking disclosure
sharing policy
account deletion policy
advertising disclosure
security notice
data export policy
`, `
clear about how my data was used
honest about the risks
easy to understand without legal help
respectful of my choices
transparent about the actual costs
specific about my rights
written in accessible language
reassuringly clear
`, `
misleading about how my data was used
vague about the risks
impossible to understand without legal help
disrespectful of my choices
evasive about the actual costs
unclear about my rights
buried in confusing language
needlessly alarming
`],
  // Hospitality and lodging.
  [`
hotel room
guest room
holiday apartment
guesthouse
hostel room
holiday cottage
camping cabin
resort suite
rental apartment
bed and breakfast
`, `
clean and comfortable
quiet enough for restful sleep
welcoming after a long journey
well maintained throughout my stay
spotlessly prepared for our arrival
comfortable even for a long stay
pleasantly free of unpleasant odors
good value for the location
`, `
dirty on arrival
too noisy for restful sleep
unwelcoming after a long journey
poorly maintained throughout my stay
infested with pests
uncomfortable even for a short stay
filled with unpleasant odors
poor value for the location
`],
  // Travel experiences (not neutral descriptions of transport).
  [`
train journey
bus journey
ferry crossing
airport transfer
guided excursion
walking tour
city tour
coach trip
boat trip
day trip
`, `
well organized from start to finish
comfortable throughout
worth the travel time
a relaxing way to travel
enjoyable despite the long distance
easy to arrange
pleasantly free of delays
managed with care for our comfort
`, `
poorly organized from start to finish
uncomfortable throughout
not worth the travel time
an exhausting ordeal
spoiled by repeated delays
needlessly difficult to arrange
stressful rather than relaxing
managed without consideration for our comfort
`],
  // Food quality, taste and preparation.
  [`
soup
stew
rice dish
pasta dish
vegetable dish
curry
sandwich
salad
breakfast
main course
`, `
freshly prepared and delicious
seasoned with care
full of flavor
beautifully balanced in flavor
tasty without being overpowering
delicious from the first bite
prepared to perfection
worth ordering again
`, `
too salty to enjoy
bland despite the description
cold when it should have been hot
burnt beyond enjoyment
poorly seasoned
unpleasantly greasy
stale rather than freshly prepared
not worth ordering again
`],
  // Desserts and baked food: avoid incompatible soup/cake predicates.
  [`
cake
pastry
cookie
biscuit
muffin
brownie
fruit tart
cinnamon roll
apple pie
cheesecake
`, `
deliciously fresh
sweet without being cloying
beautifully baked
lovely with my afternoon tea
made with obvious care
a delightful treat
worth saving room for
rich in flavor without being heavy
`, `
stale and disappointing
too sweet to enjoy
badly baked
unpleasantly dry
made without much care
a disappointing treat
not worth saving room for
heavy without much flavor
`],
  // Table service is evaluated independently of food.
  [`
cafe service
restaurant service
breakfast service
dinner service
bar service
room service
banquet service
takeaway service
catering service
lunch service
`, `
attentive without interrupting us
prompt despite the crowd
courteous from arrival to departure
careful about my dietary requirements
welcoming to our whole group
efficient without feeling rushed
helpful about the menu
respectful of our reservation
`, `
inattentive throughout the meal
slow despite the empty room
rude from arrival to departure
careless about my dietary requirements
unwelcoming to our group
rushed and impersonal
unhelpful about the menu
disrespectful of our reservation
`],
  // Teaching and explanatory materials.
  [`
lesson
tutorial
lecture
training session
workshop
study guide
explanation
demonstration
textbook chapter
practice exercise
`, `
clear enough for a beginner
engaging from start to finish
helpful for understanding the topic
well paced for learning
supported by useful examples
carefully structured
encouraging without being patronizing
worth the effort to complete
`, `
confusing even with prior knowledge
tedious from start to finish
unhelpful for understanding the topic
too rushed for learning
full of misleading examples
poorly structured
patronizing rather than encouraging
not worth the effort to complete
`],
  // Collaboration and communication.
  [`
team discussion
planning meeting
project review
handover meeting
feedback session
mentoring session
group conversation
design review
staff meeting
retrospective
`, `
respectful of different viewpoints
productive without being rushed
welcoming to new participants
focused on solving real problems
constructive rather than personal
collaborative from start to finish
open to honest questions
helpful for agreeing on next steps
`, `
dominated by personal attacks
unproductive despite the effort
unwelcoming to new participants
focused on blame rather than solutions
needlessly confrontational
dismissive of different viewpoints
hostile to honest questions
unhelpful for agreeing on next steps
`],
  // Workplace treatment, not judgments about occupations.
  [`
manager
supervisor
team leader
project coordinator
mentor
instructor
trainer
facilitator
colleague
teammate
`, `
supportive when i needed guidance
fair when assigning responsibilities
clear about what was expected
respectful when giving feedback
generous with useful advice
considerate of my workload
honest about mistakes
encouraging during a difficult task
`, `
unsupportive when i needed guidance
unfair when assigning responsibilities
unclear about what was expected
disrespectful when giving feedback
unwilling to share useful advice
inconsiderate of my workload
dishonest about mistakes
discouraging during a difficult task
`],
  // Accessibility: explicit usability evaluations, not disability labels.
  [`
ticket machine
information kiosk
booking website
registration form
application form
online menu
digital timetable
payment terminal
service portal
visitor information page
`, `
usable with my assistive technology
easy to operate with a keyboard
readable at my preferred text size
clear about accessibility options
accessible without extra assistance
free of unnecessary access barriers
easy to use without relying on color
designed to include different users
`, `
unusable with my assistive technology
impossible to operate with a keyboard
unreadable at my preferred text size
unclear about accessibility options
inaccessible without extra assistance
full of unnecessary access barriers
impossible to use without relying on color
designed without regard to different users
`],
  // Physical access and wayfinding, bounded to evaluative clauses.
  [`
venue entrance
station entrance
hotel entrance
restaurant entrance
visitor entrance
museum entrance
theater entrance
library entrance
office entrance
clinic entrance
`, `
easy to reach without stairs
clearly signposted
accessible with a mobility aid
well lit for safe access
free of unnecessary obstacles
wide enough for comfortable access
easy to find on arrival
welcoming rather than intimidating
`, `
impossible to reach without stairs
poorly signposted
inaccessible with a mobility aid
too dark for safe access
blocked by unnecessary obstacles
too narrow for comfortable access
difficult to find on arrival
intimidating rather than welcoming
`],
  // Safety and accountability: no blanket scoring of "security" or "risk".
  [`
safety briefing
emergency guidance
evacuation plan
safety notice
incident response
hazard warning
equipment briefing
security briefing
safety procedure
emergency instruction
`, `
clear about what to do
easy to follow under pressure
reassuring without hiding the risks
specific about the available help
well explained before we started
accessible to everyone present
careful about our safety
practical rather than confusing
`, `
unclear about what to do
impossible to follow under pressure
misleading about the risks
vague about the available help
poorly explained before we started
inaccessible to some participants
careless about our safety
confusing rather than practical
`],
  // Fairness, complaints and consent in explicitly local opinion contexts.
  [`
complaint handling
appeal process
dispute resolution
hiring process
selection process
disciplinary process
consultation process
decision process
allocation process
grievance process
`, `
fair to everyone involved
transparent about the reasons
respectful of personal dignity
open to independent review
free of coercive pressure
honest about its limitations
consistent with the stated rules
careful to hear different perspectives
`, `
unfair to the people involved
evasive about the reasons
disrespectful of personal dignity
closed to independent review
driven by coercive pressure
dishonest about its limitations
inconsistent with the stated rules
careless about hearing different perspectives
`]
];

// First-person affect in ordinary situations. These modifiers are NOT expanded
// into factual event descriptions or bare ambiguous emotion-related homonyms.
const affectGroups: readonly Group[] = [
  [2.3, 'joy', `
deeply appreciated
genuinely welcomed
quietly joyful
full of renewed hope
grateful for the kindness
happy to be included
relieved to have support
encouraged to keep trying
delighted by the thoughtfulness
at ease with myself
  `],
  [-2.3, 'anger', `
angry about the unfairness
frustrated by the indifference
resentful of the pressure
irritated by the disrespect
outraged by the dishonesty
fed up with the excuses
annoyed by the rudeness
insulted by the condescension
exasperated by the delays
furious about the mistreatment
  `],
  [-2.3, 'sadness', `
deeply let down
lonely despite the company
sad about being excluded
disheartened by the rejection
heartbroken by the loss
discouraged despite my efforts
overwhelmed with sadness
bereft of encouragement
unhappy with how i was treated
full of disappointment
  `],
  [-2.3, 'fear', `
afraid for my wellbeing
anxious about what might happen
worried about being hurt
uneasy about my safety
frightened by the uncertainty
panicked about being stranded
intimidated by the hostility
unnerved by the threats
overwhelmed with fear
filled with apprehension
  `],
  [1.4, 'surprise', `
pleasantly astonished
surprised by the kindness
amazed by the thoughtfulness
unexpectedly delighted
astonished by the generosity
awestruck by the beauty
surprised in a lovely way
amazed beyond my expectations
taken aback by the warm welcome
surprised by the enjoyment
  `]
];
const affectOccasions = lines(`
after the visit
after our conversation
during my stay
after the meeting
after the event
after the appointment
after the trip
during the gathering
`);

// Additional exact phrases are authored individually, including qualified
// readings of ambiguous words. Internal negation is part of each phrase score.
const phraseGroups: readonly Group[] = [
  [1.8, undefined, `
fine workmanship
fine attention to detail
a sound investment for my needs
sound advice that helped me
cheap without feeling flimsy
cheap but well made
low price without low quality
patient and attentive service
transparent about the charges
clear about every charge
no hidden charge on my bill
no pressure to buy extras
no barriers to participation
no need to struggle with the controls
not a moment of discomfort
not once did i feel unwelcome
not a single misleading claim
not a hint of disrespect
never made me feel small
never left me without support
i felt heard and respected
my concerns were taken seriously
my needs were treated with care
they made room for my needs
they respected my decision to decline
they explained the tradeoffs honestly
they carried my bags with care
they were carrying my bags carefully
they handled my complaint fairly
i would trust them with another repair
this made everyday tasks easier
this saved me unnecessary effort
this helped me regain confidence
the instructions made sense to me
the controls worked well for me
the taste was a lovely surprise
the flavors complemented each other beautifully
the portion was generous for the price
the room felt like a welcome retreat
the staff made me feel at home
i never felt pressured to spend more
there was no unpleasant aftertaste
i did not have to fight the interface
i could read everything comfortably
i could participate without extra barriers
  `],
  [-2.2, undefined, `
cold and dismissive service
cold food that should have been hot
cheap and badly made
cheap materials that fell apart
an unexplained charge on my bill
a hidden charge on my bill
sick of being ignored
sick of the constant excuses
no respect for my time
no care for my safety
no way to get my money back
no help when i needed it
not safe for my intended use
not accessible with a keyboard
not usable with a screen reader
not clear about the extra charges
not honest about the limitations
not respectful of my boundaries
not inclusive of different needs
not suitable for the advertised purpose
i felt ignored and dismissed
my concerns were brushed aside
my needs were treated as a nuisance
they made me feel like a burden
they ignored my decision to decline
they hid the tradeoffs from me
predatory sales tactics
they mishandled my complaint
i would not trust them with another repair
this made everyday tasks harder
this wasted my limited energy
this undermined my confidence
the instructions made no sense to me
the controls did not work for me
the taste was an unpleasant surprise
the flavors clashed unpleasantly
the portion was stingy for the price
the room felt neglected and unwelcoming
the staff made me feel unwanted
i felt pressured to spend more
there was an unpleasant aftertaste
i had to fight the interface
i could not read the tiny text
i could not participate without extra help
  `],
  [2.4, 'joy', `
i felt a little spark of happiness
this brought some joy to my day
i left with a lighter heart
i finally felt welcome here
their kindness stayed with me
it felt wonderful to be included
i was smiling all the way home
i felt relief wash over me
  `],
  [-2.4, 'sadness', `
i left with a heavy heart
i felt my hopes slipping away
being excluded really hurt me
i felt lonely in the crowd
the disappointment stayed with me
it hurt to be overlooked again
  `],
  [-2.4, 'anger', `
i had enough of their excuses
the disrespect made me furious
being dismissed made me angry
i resented being pushed around
their dishonesty left me seething
  `],
  [-2.4, 'fear', `
i did not feel safe there
i felt too frightened to continue
i was afraid to go back
the threats left me shaking
the uncertainty kept me anxious
fretting about my safety
  `]
];

/** Retain tuples (not a Map) so tests expose duplicates rather than hide them. */
export const domainEntries: ReadonlyArray<Entry> = [
  ...wordGroups.flatMap(([score, emotion, terms]) =>
    terms.trim().split(/\s+/u).map(term => [term, score, emotion] as const)),
  ...reviewFamilies.flatMap(([subjects, praise, criticism]) => [
    ...lines(subjects).flatMap(subject => lines(praise).map(predicate =>
      [`the ${subject} was ${predicate}`, 2] as const)),
    ...lines(subjects).flatMap(subject => lines(criticism).map(predicate =>
      [`the ${subject} was ${predicate}`, -2.2] as const))
  ]),
  ...affectGroups.flatMap(([score, emotion, feelings]) =>
    lines(feelings).flatMap(feeling => affectOccasions.map(occasion =>
      [`i felt ${feeling} ${occasion}`, score, emotion] as const))),
  ...phraseGroups.flatMap(([score, emotion, phrases]) =>
    lines(phrases).map(phrase => [phrase, score, emotion] as const))
];