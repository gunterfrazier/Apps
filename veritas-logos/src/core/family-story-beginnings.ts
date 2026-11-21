import type { FamilyStory } from "./family-stories";

export const BEGINNINGS_FAMILY_STORIES: FamilyStory[] = [
  {
    id: "adam-and-eve", title: "Adam and Eve in the Garden", testament: "old",
    sceneTitles: ["A garden to care for", "A choice in the garden", "Leaving Eden"],
    reference: "Genesis 2–3", reading: "Genesis 2:15–18; Genesis 3:1–13; Genesis 3:20–24",
    teenReading: "Genesis 2:15–25; Genesis 3:1–24",
    topic: "Trust, choices, and responsibility",
    drawPrompt: "Color the garden and draw another plant Adam and Eve could have cared for.",
    activity: {
      prompt: "What did Adam and Eve do when they heard God in the garden?",
      options: ["They hid", "They climbed a tower", "They built a boat"], answer: 0,
      explanation: "They hid among the trees. God called out and asked where they were.",
    },
    editions: {
      young: {
        paragraphs: [
          "God put the man in a garden called Eden to work in it and care for it. God said he could eat from the garden’s trees, but gave him one tree to leave alone. God made a woman, and the man and woman lived in the garden together.",
          "A serpent spoke to the woman and made her question what God had said. She took fruit from the tree God had told them to leave alone. She gave some to the man, and he ate too. When they heard God in the garden, they hid.",
          "God called to them and asked what had happened. The man and the woman each pointed to someone else. They had to leave the garden. Before they went, God made clothes for them.",
        ],
        question: "When something goes wrong, who is a trusted person you can talk to about it?",
      },
      middle: {
        paragraphs: [
          "In Genesis 2, God sets the man in Eden to work and guard the garden. God gives wide permission to eat and draws one boundary at the tree of the knowledge of good and evil. The chapter also says the man should have a partner, and the woman joins him there.",
          "In Genesis 3, the serpent’s question reshapes what God said. The woman considers the fruit and eats, and the man eats some too. They realize they are exposed, make coverings, and hide. God calls to the man and asks what has happened.",
          "The man points to the woman, and the woman points to the serpent. God describes the consequences of their choices. God makes garments for them and sends them out of Eden, setting a guard at the way to the tree of life.",
        ],
        question: "Compare Genesis 2:16–17 and 3:1. What part of God’s words does the serpent’s question leave out?",
      },
      teen: {
        paragraphs: [
          "Genesis 2 frames human life in the garden around work, care, limits, and relationship. Permission to eat from the garden precedes the single prohibition. The account ends with the man and woman together and without shame.",
          "In Genesis 3 the serpent’s question brings the prohibition to the foreground. After the man and woman eat, the story moves through covering, hiding, and blame. God’s questions draw out their actions and show what has changed in their relationships.",
          "The consequences affect work, relationships, and access to the garden. The text places God’s act of clothing them before their departure. Eden closes to them, and life outside it still includes work and care.",
        ],
        question: "Where do you see trust giving way to hiding and blame? Which detail complicates a reading focused only on punishment?",
      },
    },
  },
  {
    id: "tower-of-babel", title: "The Tower of Babel", testament: "old",
    sceneTitles: ["A city on the plain", "A tower and a name", "People scatter"],
    reference: "Genesis 11:1–9", reading: "Genesis 11:1–9", topic: "Ambition, communication, and community",
    drawPrompt: "Color the bricks and draw paths leading away from the city toward different places.",
    activity: {
      prompt: "What happened when the people could no longer understand one another?",
      options: ["They sailed away together", "They stopped building and scattered", "They made the tower wider"],
      answer: 1, explanation: "The people stopped building the city and scattered across the earth.",
    },
    editions: {
      young: {
        paragraphs: [
          "Long ago, the people in this story all spoke the same language. They found a wide plain and settled there. They made bricks and baked them until they were hard.",
          "The people wanted to build a city with a very tall tower. They thought it would make their name well known and keep everyone from scattering. They worked together on the tower.",
          "God confused their language, and the builders could no longer understand one another. They stopped building the city and moved to different places. The city was called Babel.",
        ],
        question: "How could you help someone understand you if they speak a different language?",
      },
      middle: {
        paragraphs: [
          "Genesis 11 opens with the whole earth sharing one language. People settle on the plain of Shinar and make fired bricks, using bitumen to hold them together. Their shared speech and building methods make a large project possible.",
          "They set out to build a city and a tower reaching toward the heavens. Their stated reasons are to make a name for themselves and to keep from being scattered. The narrator then describes the Lord coming down to see what they built.",
          "The Lord confuses their language so they cannot understand one another. They stop building the city and scatter. Genesis connects the name Babel with the confusion of speech.",
        ],
        question: "Which of the builders’ stated goals is reversed at the end of the story?",
      },
      teen: {
        paragraphs: [
          "The opening of Genesis 11 presents shared language, settlement, and technology. The repeated phrase inviting one another to act moves the people from making bricks to building a public monument. They name fame and remaining together as their goals.",
          "Their tower is meant to reach the heavens, yet the narrator describes the Lord coming down to inspect it. The contrast in scale sits beside the Lord’s observation about what their unity allows them to attempt.",
          "The confusion of speech stops the building, and the people experience the dispersal they wanted to prevent. Immediately after the genealogy that follows, Genesis 12 opens with God calling Abram away from his home and promising to make his name great.",
        ],
        question: "Compare Genesis 11:4 and 12:2–3. How are the goals and beneficiaries of a great name presented in each passage?",
      },
    },
  },
  {
    id: "god-calls-abraham", title: "God Calls Abraham", testament: "old",
    sceneTitles: ["A call to leave", "Along the road", "A promise for other families"],
    reference: "Genesis 12:1–9", reading: "Genesis 12:1–9",
    teenReading: "Genesis 11:31–32; Genesis 12:1–9",
    topic: "Trust, journey, and blessing",
    drawPrompt: "Color the hills and draw another thing Abram and Sarai could carry on their journey.",
    activity: {
      prompt: "Who went with Abram when he left Haran?",
      options: ["Sarai and Lot", "Moses and Aaron", "Jacob and Esau"], answer: 0,
      explanation: "Abram took Sarai and Lot, along with the people and possessions of his household.",
    },
    editions: {
      young: {
        paragraphs: [
          "Before people called him Abraham, his name was Abram. God told Abram to leave his home and go to a land God would show him. God promised to bless Abram and said that other families would be blessed through him too.",
          "Abram set out from Haran with his wife Sarai and his nephew Lot. They took their things and the people traveling with them. They traveled until they reached the land of Canaan.",
          "At Shechem, God promised the land to Abram’s family after him. Abram built an altar to worship God. The family moved on and pitched their tents again. The journey kept going.",
        ],
        question: "What could help you trust someone who is leading you to a place you have never seen?",
      },
      middle: {
        paragraphs: [
          "God calls Abram to leave his country, relatives, and father’s household for a land God will show him. God promises to make a nation from him, bless him, and give him a great name. All the families of the earth are named in the blessing.",
          "Abram leaves Haran at seventy-five. Sarai and Lot travel with him, along with their household and possessions. They reach Canaan and stop at Shechem, where the Lord appears and speaks about giving the land to Abram’s descendants.",
          "Abram builds an altar at Shechem, then moves between Bethel and Ai, pitches his tent, and builds another altar. The chapter shows both travel and worship as Abram follows the call. Later Genesis uses the names Abraham and Sarah.",
        ],
        question: "Who besides Abram is meant to benefit from the blessing in Genesis 12:1–3?",
      },
      teen: {
        paragraphs: [
          "At the end of Genesis 11, Terah’s household sets out toward Canaan and settles in Haran instead. The following chapter opens with a call to Abram to leave familiar ties and go to a land God will show him. Promise comes before the path is fully described.",
          "God promises Abram a great name and a people, but the promises reach beyond his household. The passage connects his blessing with all the families of the earth. Abram goes with Sarai, Lot, and the people and possessions of his household.",
          "At Shechem the land is promised to Abram’s descendants, and Abram marks the encounter with an altar. The second altar between Bethel and Ai continues that pattern. Tent and altar mark a life in motion with deliberate places of worship.",
        ],
        question: "Compare the things Abram is asked to leave with the people included in the promise. How does each list shape your reading of the journey?",
      },
    },
  },
  {
    id: "sarah-laughs", title: "Sarah Laughs", testament: "old",
    sceneTitles: ["Visitors by the tent", "Sarah hears a promise", "Laughter when Isaac is born"],
    reference: "Genesis 18:1–15 and 21:1–7", reading: "Genesis 18:9–15; Genesis 21:1–7",
    teenReading: "Genesis 17:15–19; Genesis 18:9–15; Genesis 21:1–7",
    topic: "Waiting, surprise, and joy",
    drawPrompt: "Color Sarah’s shawl and the tent. Draw a detail that shows there is reason to celebrate.",
    activity: {
      prompt: "What name did Abraham and Sarah give their son?",
      options: ["Jacob", "Isaac", "Samuel"], answer: 1,
      explanation: "They named their son Isaac. His name is linked to laughter.",
    },
    editions: {
      young: {
        paragraphs: [
          "Abraham was sitting by his tent when three visitors came. He welcomed them and brought food. Sarah helped get the meal ready.",
          "One of the visitors said Sarah would have a son. Sarah heard the promise from the tent and laughed quietly. Abraham and Sarah were old, and the news seemed impossible to her.",
          "Later Sarah had a baby, just as God had promised. Abraham named him Isaac. Sarah said God had brought her laughter, and other people would laugh with her. This time the laughter went with joy.",
        ],
        question: "How does Sarah’s laughter change from the first part of the story to the last?",
      },
      middle: {
        paragraphs: [
          "In Genesis 18, three visitors arrive near Abraham’s tent. Abraham offers water and a meal, and Sarah prepares bread. After the meal the visitors ask where Sarah is, then one says she will have a son when he returns.",
          "Sarah listens at the tent entrance and laughs to herself. She and Abraham are advanced in years, which makes the promise hard to believe. The Lord asks why she laughed and whether anything is too hard for him.",
          "Genesis 21 says the Lord did for Sarah what he had promised. Abraham names the child Isaac. Sarah speaks of the laughter God has given her and expects others to share it. The same action now expresses a different response to the promise.",
        ],
        question: "What is Sarah responding to when she laughs in Genesis 18:12, and what is she responding to in 21:6?",
      },
      teen: {
        paragraphs: [
          "Genesis 17 records Abraham laughing when God says Sarah will have a son. God gives the child’s name as Isaac. In Genesis 18 the promise comes again in the setting of hospitality, after Abraham and Sarah prepare food for visitors.",
          "Sarah overhears the promise and laughs to herself. The narrator names the reason the promise is hard to imagine. The Lord’s question about what is too hard places Sarah’s immediate assessment beside divine ability.",
          "Genesis 21 repeats that God acted as promised. Sarah describes laughter as something God has given her and anticipates other people laughing with her. The story moves from private astonishment to joy she can share publicly.",
        ],
        question: "Compare Abraham’s laughter in Genesis 17:17 with Sarah’s in 18:12 and 21:6. What changes over those three moments?",
      },
    },
  },
  {
    id: "jacob-and-esau", title: "Jacob and Esau Make Peace", testament: "old",
    sceneTitles: ["Jacob fears the meeting", "A long night before dawn", "Esau runs to meet Jacob"],
    reference: "Genesis 32–33", reading: "Genesis 32:3–12; Genesis 33:1–11",
    teenReading: "Genesis 32:22–32; Genesis 33:1–17",
    topic: "Fear, reconciliation, and making peace",
    drawPrompt: "Color the brothers’ robes and draw the path where Esau ran to meet Jacob.",
    activity: {
      prompt: "What did Esau do when he saw Jacob?",
      options: ["He ran to embrace him", "He hid behind a tree", "He turned and went home"],
      answer: 0, explanation: "Esau ran to meet Jacob, hugged him, and wept with him.",
    },
    editions: {
      young: {
        paragraphs: [
          "Jacob and Esau were brothers. Long before, Jacob had tricked their father to get a blessing meant for Esau. After many years away, Jacob came back and heard that Esau was coming to meet him. Jacob was afraid.",
          "Jacob prayed and sent gifts ahead. That night, Jacob was alone after his family crossed a stream. He wrestled until dawn, and he was given a new name, Israel.",
          "In the morning, Jacob bowed as he came near Esau. Esau ran to meet him and hugged him. Both brothers cried. Jacob urged Esau to accept his gift, and Esau did. They went on their journeys in peace.",
        ],
        question: "What did Esau do that surprised Jacob after he had been afraid?",
      },
      middle: {
        paragraphs: [
          "Jacob is returning after years away from Esau. Their last time together ended with anger over Isaac’s blessing. When Jacob hears that Esau is coming with four hundred men, he divides his camp, prays for rescue, and sends ahead a series of gifts.",
          "Jacob sends his household across the Jabbok and is left alone. A man wrestles with him until daybreak. Jacob receives a blessing and a new name, Israel. He leaves the encounter limping.",
          "Jacob bows seven times as he approaches his brother. Esau runs to him, embraces him, and weeps with him. After Jacob urges him to receive the gift, Esau accepts it. The brothers talk about traveling and then head toward different places.",
        ],
        question: "How do Jacob’s plans in Genesis 32 compare with what actually happens in Genesis 33:4?",
      },
      teen: {
        paragraphs: [
          "Jacob approaches Esau expecting danger. He divides his camp, recalls God’s promise in prayer, and sends gifts ahead. The preparations show how deeply the conflict over Isaac’s blessing still shapes what he expects.",
          "After the family crosses the Jabbok, the account interrupts the expected meeting with a night of wrestling. Jacob receives the name Israel and leaves with a limp. The next scene begins with him looking up and seeing Esau.",
          "Esau’s run and embrace interrupt Jacob’s careful approach. Jacob urges Esau to accept his gift and compares seeing his brother’s face with seeing the face of God. Their exchange ends with acceptance and separate routes, giving the reconciliation a quieter conclusion than Jacob anticipates.",
        ],
        question: "How does the reference to seeing Esau’s face in Genesis 33:10 connect the meeting with the night before?",
      },
    },
  },
  {
    id: "baby-moses", title: "Baby Moses in the Basket", testament: "old",
    sceneTitles: ["A basket among the reeds", "A princess finds the baby", "Help from Miriam"],
    reference: "Exodus 2:1–10", reading: "Exodus 2:1–10",
    teenReading: "Exodus 1:15–22; Exodus 2:1–10",
    topic: "Courage, protection, and care",
    drawPrompt: "Color the reeds and draw gentle ripples around the basket.",
    activity: {
      prompt: "Who found the basket by the river?",
      options: ["A shepherd", "Pharaoh’s daughter", "Abraham"], answer: 1,
      explanation: "Pharaoh’s daughter saw the basket, had it brought to her, and felt compassion for the baby.",
    },
    editions: {
      young: {
        paragraphs: [
          "In Egypt, the ruler gave a cruel order that put Hebrew baby boys in danger. One mother hid her baby for three months. When she could hide him no longer, she made a basket that would keep water out. She put it among the reeds by the river.",
          "The baby’s sister stayed nearby to see what would happen. Pharaoh’s daughter came to the river and saw the basket. A servant brought it to her. When the princess opened it and heard the baby cry, she felt sorry for him.",
          "The baby’s sister offered to find someone to care for him. She brought his own mother. His mother cared for him until he grew older. Then Pharaoh’s daughter took him into her family and called him Moses.",
        ],
        question: "What did each person do to help keep the baby safe?",
      },
      middle: {
        paragraphs: [
          "Exodus 1 ends with Pharaoh ordering Hebrew sons to be thrown into the Nile. In the next chapter, a Levite mother hides her child for three months. When she can no longer hide him, she coats a papyrus basket and sets it among the reeds along the river.",
          "His sister watches from a distance. Pharaoh’s daughter notices the basket, sends a servant to get it, and opens it. She recognizes the crying baby as a Hebrew child and has compassion on him.",
          "The sister offers to find a Hebrew woman to nurse him and brings his mother. Pharaoh’s daughter pays her to care for him. When he is older, she takes him as her son, naming him Moses because she drew him out of the water.",
        ],
        question: "Which choices in Exodus 2:1–10 change what Pharaoh’s order would have meant for the baby?",
      },
      teen: {
        paragraphs: [
          "The story follows Pharaoh’s command about the Nile in Exodus 1:22. The basket uses the same river as a place to protect a child. Details about the coating, reeds, and watching sister make the mother’s decision both deliberate and uncertain.",
          "Pharaoh’s daughter recognizes the child as Hebrew. Her compassion becomes a decision to protect someone endangered by her own household’s authority. The sister sees a chance to speak and offers a practical way to care for the baby.",
          "The mother receives the child back as his nurse, and Pharaoh’s daughter later adopts and names him. The chapter opens Moses’s story through the actions of the women who help him survive, long before Moses acts on behalf of his people.",
        ],
        question: "How do the women use the choices available to them, and where does their cooperation cross the boundaries Pharaoh tried to impose?",
      },
    },
  },
];
