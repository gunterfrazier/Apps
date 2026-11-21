import type { AgeGroup } from "./family";
import { BATCH_FAMILY_STORIES } from "./family-story-batch";
import { MORE_FAMILY_STORIES } from "./family-story-more";
import { NEW_FAMILY_STORIES } from "./family-story-expansion";

interface StoryEdition { paragraphs: string[]; question: string }
export interface StoryActivity { prompt: string; options: string[]; answer: number; explanation: string }
export interface FamilyStory {
  id: string;
  title: string;
  testament: "old" | "new";
  sceneTitles: string[];
  reference: string;
  reading: string;
  teenReading?: string;
  topic: string;
  drawPrompt: string;
  activity: StoryActivity;
  editions: Partial<Record<AgeGroup, StoryEdition>>;
}

const existingStories: FamilyStory[] = [
  {
    id: "noah",
    title: "Noah and the ark",
    testament: "old",
    sceneTitles: ["God speaks to Noah", "Inside the ark", "Rain and rising water", "Noah sends a dove", "A promise in the clouds"],
    reference: "Genesis 6–9",
    reading: "Genesis 8:6–12; Genesis 9:8–17",
    teenReading: "Genesis 6:11–22; Genesis 9:8–17",
    topic: "Trust and promises",
    drawPrompt: "Color the ark, the animals, and the rainbow. Draw a dove carrying a leaf nearby.",
    activity: {
      prompt: "What did the dove bring back to Noah?",
      options: ["A feather", "An olive leaf", "A piece of wood"],
      answer: 1,
      explanation: "The olive leaf helped Noah see that the water was going down.",
    },
    editions: {
      young: {
        paragraphs: [
          "People on earth were hurting one another. God told Noah a flood was coming and showed him how to build a huge boat called an ark. Noah built it with rooms inside and covered it to keep the water out.",
          "Noah, his family, and the animals went into the ark. They brought food for the people and the animals. When they were inside, God shut the door.",
          "Rain fell for forty days and nights. The waters rose and lifted the ark off the ground. Later the rain stopped, and the water slowly went down. The ark came to rest on the mountains of Ararat.",
          "Noah sent out a dove, but it came back because it could not find a place to rest. After seven days he tried again. This time the dove carried back a fresh olive leaf. Noah knew the water was going down.",
          "When God told Noah to leave the ark, his family and the animals went out onto dry ground. God promised that a flood would never again destroy all life on earth. He put a rainbow in the clouds as a sign of his promise.",
        ],
        question: "What sign did God give Noah and his family?",
      },
      middle: {
        paragraphs: [
          "Genesis says the earth was full of violence. God warned Noah of the flood and gave him directions for building a wooden ark. Noah was to put rooms and decks inside, coat the ark with pitch, and collect enough food for the people and animals it would shelter.",
          "Noah’s wife, his three sons, and their wives went aboard with him. Animals and birds came into the ark as God had directed. Genesis ends the boarding scene with a detail about who closed the door. The Lord shut Noah in.",
          "Rain fell for forty days and nights, and the ark rose with the water. After many days, God sent a wind and the waters began to recede. The ark rested in the mountains of Ararat, but Noah still had to wait for dry ground.",
          "Noah opened the ark’s window and sent out birds. The dove returned the first time without finding a resting place. After seven days it returned with a fresh olive leaf. Noah waited another seven days, and the dove did not come back the third time.",
          "God told Noah to bring his family and the animals out. Noah built an altar and worshiped. God made a covenant with Noah, his descendants, and every living creature. The rainbow would be a sign of the promise that a flood would never again destroy all flesh.",
        ],
        question: "Who is included in God’s promise in Genesis 9:8–17?",
      },
      teen: {
        paragraphs: [
          "Genesis 6 describes an earth corrupted by violence. Noah receives instructions to build an ark with specific dimensions, decks, a door, and pitch inside and out. The work of preparing shelter and storing provisions gives the story a practical dimension before the flood arrives.",
          "The people boarding the ark are Noah, his wife, their sons, and their sons’ wives. The animals are brought in under God’s directions. The narrative records Noah’s obedience and then closes the scene by naming the Lord as the one who shuts him in.",
          "The flood is measured in stages. Forty days of rain lift the ark, and the waters prevail for much longer. Genesis 8 begins its reversal by saying that God remembered Noah and the creatures in the ark. A wind passes over the earth, and the waters begin to recede.",
          "Noah’s three releases of the dove measure what he can know from inside the ark. The bird returns with no resting place, later returns with an olive leaf, and finally stays away. Even after Noah sees the ground drying, he leaves when God gives the instruction.",
          "Noah’s first action outside the ark is worship. God’s covenant in Genesis 9 expressly reaches Noah’s descendants and other creatures. The rainbow marks a promise about the preservation of life as the story closes, after an opening that emphasized the destruction human violence had brought.",
        ],
        question: "How does the scope of the covenant in Genesis 9 change how you read the opening of the flood story?",
      },
    },
  },
  {
    id: "galilee",
    title: "Jesus calms the storm",
    testament: "new",
    sceneTitles: ["Across the lake", "A storm fills the boat", "Jesus speaks to the waves", "The disciples ask a question"],
    reference: "Mark 4:35–41",
    reading: "Mark 4:35–41",
    teenReading: "Mark 4:35–41; Psalm 107:23–30",
    topic: "Fear and faith",
    drawPrompt: "Color the boat and the waves. Draw a patch of calm water where the storm has passed.",
    activity: {
      prompt: "What did Jesus do when his friends woke him?",
      options: ["He spoke to the wind and waves", "He asked them to swim", "He put up the sail"],
      answer: 0,
      explanation: "Jesus spoke to the wind and waves, and the storm became calm.",
    },
    editions: {
      young: {
        paragraphs: [
          "Jesus had been teaching beside the Sea of Galilee. That evening he told his friends they would cross to the other side. They left the crowd behind and took Jesus with them in the boat.",
          "A strong wind came up on the lake. Waves splashed over the sides and the boat began to fill with water. Jesus was asleep on a cushion at the back of the boat. His friends woke him and asked if he cared that they were in danger.",
          "Jesus got up and spoke to the wind and the waves. He told them to be still. The wind stopped and the lake became quiet.",
          "Jesus asked his friends why they were afraid and where their faith was. They were amazed. They asked one another who Jesus could be, since even the wind and the waves listened to him.",
        ],
        question: "What did Jesus’ friends do when the storm scared them?",
      },
      middle: {
        paragraphs: [
          "After teaching a crowd from a boat, Jesus told the disciples to cross the lake that evening. They left the crowd behind and took him as he was. Mark also notes that other boats went with them.",
          "As they crossed, a fierce windstorm drove waves into the boat. The disciples found Jesus asleep on a cushion in the stern, the back of the boat. They woke him with a question about whether he cared that they might drown.",
          "Jesus stood up and rebuked the wind. He told the sea to be still. The wind died away, and the violent water became very calm.",
          "Jesus asked the disciples why they were afraid and whether they still lacked faith. They were filled with fear after the storm had stopped and asked one another who he was. The danger had gone, but the question about Jesus grew larger.",
        ],
        question: "How do the disciples’ questions change from the beginning of the storm to the end?",
      },
      teen: {
        paragraphs: [
          "In Mark 4, a day of teaching beside the sea leads into a night crossing. Jesus initiates the trip. Mark’s references to evening, other boats, and a cushion in the stern keep the scene grounded in the details of an ordinary journey.",
          "The storm threatens to fill the boat while Jesus sleeps. The disciples ask him whether he cares that they are perishing. Their words make a question about Jesus’ care part of a situation that is already physically dangerous.",
          "Jesus rebukes the wind and addresses the sea. Mark moves from a great windstorm to a great calm. Psalm 107:23–30 describes sailors calling on the Lord in a storm and offers a comparison for the way Mark presents the stilling of the sea.",
          "After the calm, Jesus asks about fear and faith. The disciples’ great fear then becomes a question of identity. Read their final question next to their first question and notice how the same people move from asking about care to asking who Jesus is.",
        ],
        question: "What do the two questions the disciples ask reveal about what they still have to learn?",
      },
    },
  },
  {
    id: "samaritan",
    title: "The Good Samaritan",
    testament: "new",
    sceneTitles: ["A question about neighbors", "Two people pass by", "The Samaritan stops", "Go and show mercy"],
    reference: "Luke 10:25–37",
    reading: "Luke 10:25–37",
    topic: "Mercy and neighbors",
    drawPrompt: "Color the traveler, the Samaritan, and the donkey. Draw a path to a safe place.",
    activity: {
      prompt: "How did the Samaritan help the traveler?",
      options: ["He walked past", "He told him to stand up", "He cared for him and took him to an inn"],
      answer: 2,
      explanation: "The Samaritan stayed with the wounded traveler and made sure someone would look after him.",
    },
    editions: {
      young: {
        paragraphs: [
          "A man asked Jesus who counted as his neighbor. Jesus began a story about a traveler taking the road from Jerusalem down to Jericho. Robbers hurt the traveler and left him by the road.",
          "A priest came down the road. He saw the hurt traveler and went by on the other side. A Levite, another person who served at the temple, came along and did the same thing.",
          "A Samaritan saw the traveler and stopped. He treated the man’s wounds and helped him onto his animal. Then he took him to an inn and cared for him.",
          "The next day the Samaritan paid the innkeeper to keep looking after the traveler. Jesus asked which person had been a neighbor to the man. The answer was the person who showed mercy. Jesus told the man to go and do the same.",
        ],
        question: "What is one kind thing you could do for someone who needs help?",
      },
      middle: {
        paragraphs: [
          "An expert in the law asked Jesus about eternal life. When Jesus asked what the law said, the man answered that he should love God and love his neighbor. Then he asked who his neighbor was. Jesus replied with a story about the road from Jerusalem to Jericho.",
          "Robbers stripped and beat a traveler, leaving him badly hurt. A priest saw the man and crossed to the other side. A Levite came to the place and passed by too. The story describes what they saw and did without explaining why they kept going.",
          "A Samaritan came near and felt compassion. He treated the traveler’s wounds with oil and wine and bandaged them. He put the traveler on his own animal, took him to an inn, and cared for him there.",
          "The next day the Samaritan gave the innkeeper two coins and promised to pay more if care cost more. Jesus asked who acted like a neighbor to the man. When the expert answered that it was the one who showed mercy, Jesus asked him to do likewise.",
        ],
        question: "What did it cost the Samaritan to stop and help?",
      },
      teen: {
        paragraphs: [
          "The conversation in Luke 10 begins with an expert in the law asking about eternal life. Jesus returns the question to what he reads in the law. The expert names love of God and of neighbor, then asks who his neighbor is. The parable answers that second question.",
          "A traveler going down from Jerusalem to Jericho is robbed, beaten, and left in need of help. The priest and Levite both see him and pass by. Their motives are left unstated, which makes their observable choices the focus of this part of the story.",
          "The Samaritan sees the same person and has compassion. The narrative spends time on each action: treating wounds, transporting the traveler, taking him to shelter, and caring for him overnight. In the world of the story, the Samaritan is the person the questioner might least expect to act as the neighbor.",
          "The Samaritan pays for continued care and agrees to cover the rest. Jesus asks who became a neighbor to the injured man. The expert identifies the one who showed mercy. The shift from defining a neighbor to becoming a neighbor leads directly to Jesus’ instruction to act.",
        ],
        question: "How would a real situation change if you asked how to become a neighbor to someone instead of asking whether they count as one?",
      },
    },
  },
  {
    id: "jesus-welcomes-children",
    title: "Jesus welcomes the children",
    testament: "new",
    sceneTitles: ["Families come to Jesus", "The disciples try to stop them", "Jesus teaches about the kingdom", "Jesus holds and blesses the children"],
    reference: "Mark 10:13–16",
    reading: "Mark 10:13–16",
    topic: "Welcome and belonging",
    drawPrompt: "Color Jesus and the children. Draw a flower for each child you can find.",
    activity: {
      prompt: "How did Jesus respond when people brought children to him?",
      options: ["He welcomed and blessed them", "He told them to wait outside", "He asked them to come back when they were older"],
      answer: 0,
      explanation: "Jesus welcomed the children, took them in his arms, and blessed them.",
    },
    editions: {
      young: {
        paragraphs: [
          "People came to Jesus and brought children with them. They hoped Jesus would lay his hands on the children and bless them.",
          "Jesus’ friends told the people to stop. When Jesus saw what was happening, he was upset and told his friends to let the children come.",
          "Jesus said that God’s kingdom belongs to people like these children. He told the people listening that they must receive the kingdom like a child.",
          "Then Jesus took the children in his arms. He put his hands on them and blessed them. The children the disciples had tried to turn away were right beside him.",
        ],
        question: "How can you make someone feel welcome today?",
      },
      middle: {
        paragraphs: [
          "People brought children to Jesus to ask for his blessing. Mark says they wanted Jesus to touch them. Matthew, who also tells the story, says they wanted him to put his hands on the children and pray.",
          "The disciples scolded the people who brought the children. Jesus saw it and was upset. He told his disciples to let the children come and to stop getting in their way.",
          "Jesus said the kingdom of God belongs to people like the children. He went on to say that anyone who does not receive God’s kingdom like a child will not enter it. The children became the center of a lesson for the adults.",
          "Jesus took the children into his arms, placed his hands on them, and blessed them. His welcome included what he did as well as what he said.",
        ],
        question: "What do Jesus’ words and actions show about who matters to him?",
      },
      teen: {
        paragraphs: [
          "Mark gives a short account with a clear sequence. People bring children so Jesus might touch them, the disciples rebuke the people, and Jesus sees what has happened. Pay attention to who acts and who is spoken to at each point.",
          "Jesus is indignant and tells the disciples to let the children come. The disciples’ attempt to manage access is part of the story because Jesus addresses it directly. His words make room for the children the disciples had tried to turn away.",
          "Jesus links the children to the kingdom of God. He says it belongs to people like them and must be received like a child. Mark gives no list of childhood qualities, leaving readers to consider what receiving a gift means in this scene.",
          "The passage ends with Jesus taking the children into his arms, laying his hands on them, and blessing them. The children become recipients of attention and care as well as the people through whom the disciples learn.",
        ],
        question: "Where do people your age get overlooked, and how does Jesus’ response shape what you might do?",
      },
    },
  },
  {
    id: "prodigal-son",
    title: "The son who came home",
    testament: "new",
    sceneTitles: ["A son leaves home", "A hard time far away", "The father runs to meet him", "The older brother hears the news"],
    reference: "Luke 15:11–32",
    reading: "Luke 15:11–24",
    teenReading: "Luke 15:11–32",
    topic: "Forgiveness and joy",
    drawPrompt: "Color the father and his son. Draw a path to the father’s house.",
    activity: {
      prompt: "What did the father do when he saw his son coming home?",
      options: ["He hid inside", "He ran to meet him", "He sent him away"],
      answer: 1,
      explanation: "The father saw his son from far away, ran to him, and hugged him.",
    },
    editions: {
      young: {
        paragraphs: [
          "Jesus told a story about a father with two sons. The younger son asked for his share of the family’s things. After his father divided what he owned, the son took his share far away and spent it.",
          "When the land ran short of food, the son took a job feeding pigs. He was so hungry he wanted what the pigs were eating. He thought about home, where his father’s workers had bread, and decided to go back and say he was sorry.",
          "The father saw him far down the road. He ran to hug him. The son said he had done wrong, and his father called for a robe, a ring, and a meal to celebrate. His son had come home.",
          "The older son heard music and was angry when he learned why there was a party. His father came outside to talk to him. He told him there was reason to be glad because his brother had been lost and was found.",
        ],
        question: "How do you think the son felt when his father ran to hug him?",
      },
      middle: {
        paragraphs: [
          "Jesus tells of a father with two sons. The younger asks for his inheritance before his father dies. The father divides his property, and the younger son takes his share to a far country, where he spends what he has.",
          "A famine comes when the money is gone. The son takes work feeding pigs and is hungry enough to want their food. He remembers his father’s workers have bread to spare. He plans to go home, confess what he did, and ask to be treated as a worker.",
          "The father sees his son from far away and runs to embrace him. The son says he has sinned and is unworthy to be called a son. The father calls for the best robe, a ring, sandals, and a celebration for the son he thought was lost.",
          "The older son comes back from the fields and refuses to go inside. He tells his father why the party seems unfair. The father goes out to him too, says all he has is already his, and asks him to be glad that his brother is alive and home.",
        ],
        question: "What does the father do to welcome each of his sons?",
      },
      teen: {
        paragraphs: [
          "Luke 15 begins with complaints that Jesus welcomes sinners and eats with them. The parable introduces a father who divides his property between two sons. The younger son leaves and spends his share in a distant place.",
          "The famine exposes how little the younger son has left. While feeding pigs, he remembers food in his father’s house and rehearses a confession and a request to become a hired worker. Notice what he expects he will have to ask for on his return.",
          "Before the younger son reaches the house, his father sees him, runs, and embraces him. The son confesses, and the father calls for signs of welcome and a feast. The anticipated conversation about a hired worker gives way to a public celebration of his return as a son.",
          "The father also goes out to the older brother, who speaks of his years of service and the unfairness he feels. The father affirms their relationship and asks him to share the joy. Luke leaves the older brother’s response open to the listener.",
        ],
        question: "Which brother is harder for you to understand, and how does the father respond to him?",
      },
    },
  },
];

export const FAMILY_STORIES: FamilyStory[] = [...NEW_FAMILY_STORIES, ...existingStories, ...MORE_FAMILY_STORIES, ...BATCH_FAMILY_STORIES];
