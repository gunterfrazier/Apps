import type { FamilyStory } from "./family-stories";

export const MORE_FAMILY_STORIES: FamilyStory[] = [
  {
    id: "david", title: "David and Goliath", testament: "old",
    sceneTitles: ["A challenge from the valley", "Five smooth stones", "David faces Goliath"],
    reference: "1 Samuel 17", reading: "1 Samuel 17:32–50", topic: "Courage and trust",
    drawPrompt: "Color David and count the smooth stones. Draw a stream beside him.",
    activity: {
      prompt: "What did David take from the stream?",
      options: ["Five smooth stones", "A helmet", "A loaf of bread"], answer: 0,
      explanation: "David chose five smooth stones and carried them in his shepherd’s bag.",
    },
    editions: {
      young: {
        paragraphs: [
          "David brought food to his brothers, who were with Israel’s army. From the other side of the valley, a giant soldier named Goliath challenged someone to fight him. The soldiers were afraid, but David told King Saul he would go.",
          "David remembered how God had helped him protect his sheep. Saul offered David armor, but David was not used to wearing it. He put it aside, picked five smooth stones from a stream, and took his sling.",
          "Goliath laughed when he saw David. David said that the battle belonged to the Lord. He slung a stone that struck Goliath, and Goliath fell. The shepherd boy had faced the soldier everyone was afraid of.",
        ],
        question: "What did David remember when he needed courage?",
      },
      middle: {
        paragraphs: [
          "Goliath repeated his challenge for forty days while the armies faced each other across a valley. David arrived with supplies from home and heard the challenge for himself. When he volunteered, Saul pointed out the difference between a young shepherd and a soldier who had trained for years.",
          "David recalled defending his sheep from a lion and a bear and said the Lord who rescued him then could rescue him again. He tried Saul’s armor and found he could not move easily in it. He went down with his own staff, sling, and five stones from the stream.",
          "Goliath mocked David’s size and equipment. David answered that the Lord did not need a sword or spear to save. One stone brought Goliath down. The narrator emphasizes that David prevailed with a sling and a stone before he had a sword in his hand.",
        ],
        question: "What does David’s choice of equipment show about his experience and his trust in God?",
      },
    },
  },
  {
    id: "jonah", title: "Jonah and the great fish", testament: "old",
    sceneTitles: ["A ship going the other way", "A prayer inside the fish", "Another chance", "The plant and the city"],
    reference: "Jonah 1–4", reading: "Jonah 3:1–10; Jonah 4:6–11", topic: "Second chances and mercy",
    drawPrompt: "Color the fish and Jonah. Add bubbles, waves, or another sea creature.",
    activity: {
      prompt: "Where did God send Jonah?",
      options: ["Bethlehem", "Jericho", "Nineveh"], answer: 2,
      explanation: "God sent Jonah to warn the people of Nineveh.",
    },
    editions: {
      young: {
        paragraphs: [
          "God told Jonah to go to Nineveh and warn the people there. Jonah got on a ship going the other way. A strong storm hit the ship. Jonah told the sailors to put him in the sea, and the storm stopped.",
          "God sent a great fish that swallowed Jonah. Jonah prayed inside the fish. After three days and nights, God told the fish to put Jonah back on dry land.",
          "God gave Jonah his job again, and this time Jonah went to Nineveh. The people listened to his warning and turned away from the wrong things they were doing. God spared their city.",
          "Jonah was angry. Outside the city, he was glad when a plant gave him shade, and sad when it dried up. God asked Jonah why God should not care about a whole city full of people and animals.",
        ],
        question: "Who got a second chance in this story?",
      },
      middle: {
        paragraphs: [
          "Jonah boarded a ship for Tarshish after God told him to go to Nineveh. When a storm threatened the ship, Jonah admitted he was running away and told the sailors to throw him overboard. They first tried rowing to land. When they finally put him in the sea, the water grew calm.",
          "God appointed a great fish to swallow Jonah. Jonah’s prayer remembers sinking deep in the water and thanks God for bringing him up from danger. After three days and nights, the fish put Jonah ashore.",
          "The second time God called, Jonah went to Nineveh and announced that the city would be overthrown in forty days. From the king down, people humbled themselves and turned away from violence. When God saw what they did, he spared the city.",
          "Jonah said he had fled because he knew God was merciful. He sat outside the city, where a plant shaded him until a worm damaged it. God used Jonah’s concern for the plant to ask why he should not care for Nineveh’s people and animals.",
        ],
        question: "How does Jonah respond to mercy when he needs it and when Nineveh receives it?",
      },
    },
  },
  {
    id: "esther", title: "Esther speaks up", testament: "old",
    sceneTitles: ["Mordecai’s message", "The king’s scepter", "Two banquets", "A new decree"],
    reference: "Esther 4–8", reading: "Esther 4:10–17; Esther 5:1–8", teenReading: "Esther 4:10–17; Esther 7:1–6; Esther 8:3–8",
    topic: "Courage and responsibility",
    image: {
      file: "esther.webp",
      alt: "Esther leans on her attendants as the king turns toward her from his throne.",
      credit: "Esther before Ahasuerus, Artemisia Gentileschi · The Metropolitan Museum of Art",
      source: "https://www.metmuseum.org/art/collection/search/436453",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    drawPrompt: "Find the scepter in the picture. What might Esther be thinking as she approaches the king?",
    activity: {
      prompt: "What did Esther ask the Jews in Susa to do before she approached the king?",
      options: ["Send gifts", "Fast for three days", "Leave the city"], answer: 1,
      explanation: "Esther asked them to fast for her. She and her attendants would fast too.",
    },
    editions: {
      middle: {
        paragraphs: [
          "Queen Esther learned that Haman had persuaded the king to order the destruction of the Jewish people. Mordecai told her about the order and asked her to plead for her people. Entering the king’s court uninvited could cost Esther her life.",
          "Mordecai asked whether Esther had come to her royal position for such a time. She asked the Jews in Susa to fast with her for three days. Then she entered the court. When the king held out his gold scepter, she could speak safely.",
          "Esther invited the king and Haman to a banquet, and then to a second one. There she asked the king to spare her life and the lives of her people. When the king asked who was responsible, Esther named Haman.",
          "The danger did not end with Haman’s downfall. Esther pleaded with the king again because the original decree still stood. The king authorized a new decree that allowed the Jewish people to defend themselves.",
        ],
        question: "Where do you see Esther preparing carefully before she speaks up?",
      },
      teen: {
        paragraphs: [
          "Haman secures an imperial decree against the Jewish people. Esther has access to the palace, but the law also restricts her access to the king. Mordecai challenges her assumption that royal status can shelter her from what threatens everyone else.",
          "Mordecai frames the purpose of Esther’s position as a question. Esther responds by asking the community in Susa to fast with her before she acts. The text holds the uncertainty of the outcome alongside her decision to enter the court.",
          "The king extends the scepter, and Esther uses two banquets to choose the moment for her appeal. When she reveals that her own life is threatened along with her people’s, the court must reckon with a decree it has already authorized.",
          "Haman’s removal does not cancel the decree. Esther returns to plead again, and the king authorizes another order, written in his name, to allow the Jews to defend themselves. The story gives attention both to Esther’s personal courage and to the changes required to protect others.",
        ],
        question: "How does Esther’s use of timing and community support shape what courage looks like in this story?",
      },
    },
  },
  {
    id: "daniel", title: "Daniel in the lions’ den", testament: "old",
    sceneTitles: ["A law aimed at Daniel", "The open window", "At the den before dawn"],
    reference: "Daniel 6", reading: "Daniel 6:6–23", topic: "Integrity under pressure",
    image: {
      file: "daniel.webp",
      alt: "Daniel sits with his hands clasped and looks up while lions surround him.",
      credit: "Daniel in the Lions’ Den, Sir Peter Paul Rubens · National Gallery of Art",
      source: "https://www.nga.gov/artworks/50298-daniel-lions-den",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    drawPrompt: "Find Daniel and the lions. Pick a detail that helps you tell how the night ended.",
    activity: {
      prompt: "What did Daniel continue to do after he heard about the law?",
      options: ["Pray three times a day", "Hide in the palace", "Leave for Jerusalem"], answer: 0,
      explanation: "Daniel knelt and prayed three times a day as he had done before.",
    },
    editions: {
      middle: {
        paragraphs: [
          "King Darius trusted Daniel and planned to give him more responsibility. Other officials looked for wrongdoing but could not find any. They persuaded the king to sign a law saying that for thirty days people could make requests only to the king.",
          "Daniel heard about the law and went home. He knelt by his upstairs windows, which opened toward Jerusalem, and prayed as usual. The officials reported him. Darius tried to rescue Daniel, but the law could not be changed, and Daniel was put into the lions’ den.",
          "The worried king spent the night without food or sleep. At dawn he called into the den. Daniel answered that God had sent an angel to shut the lions’ mouths. When Daniel was pulled out, he had no injury.",
        ],
        question: "Why is it important that Daniel was already in the habit of praying before the law was signed?",
      },
      teen: {
        paragraphs: [
          "Daniel’s rivals cannot find corruption or negligence in his work, so they target his religious practice. They tell Darius that officials agree on a temporary decree concentrating petitions on the king. The king signs it, giving political force to a plan he does not yet understand.",
          "Daniel knows the decree has been signed. His posture, open windows toward Jerusalem, and daily schedule are described in familiar terms. When the officials accuse him, they use the very rule the king signed to argue that the king cannot save the official he trusts.",
          "Darius seals the den and spends a sleepless night. At dawn Daniel credits his rescue to God, who sent an angel to shut the lions’ mouths. The encounter reverses the helplessness the king displayed the night before. The chapter ends with Darius addressing his kingdom about Daniel’s God.",
        ],
        question: "Compare Daniel’s power with Darius’s. What can each person control, and where do you see the limits of their control?",
      },
    },
  },
];
