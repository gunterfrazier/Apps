import type { FamilyStory } from "./family-stories";

export const BATCH_FAMILY_STORIES: FamilyStory[] = [
  {
    id: "red-sea", title: "Crossing the Red Sea", testament: "old",
    sceneTitles: ["Camp by the sea", "A path through the water", "On the other shore"],
    reference: "Exodus 14", reading: "Exodus 14:10–31",
    teenReading: "Exodus 13:17–22; Exodus 14:10–31",
    topic: "Fear, rescue, and trust",
    drawPrompt: "Color a dry path through the water and draw footprints leading to the far shore.",
    activity: {
      prompt: "How did the Israelites get across the sea?",
      options: ["They took boats", "They walked on dry ground", "They built a bridge"],
      answer: 1,
      explanation: "God opened a path through the sea, and the Israelites walked across on dry ground.",
    },
    editions: {
      young: {
        paragraphs: [
          "The Israelites had left Egypt, where they had been forced to work. They camped near the sea. When they saw Pharaoh’s army coming after them, they were afraid. Moses told them to watch how God would rescue them.",
          "God told the people to move forward. Moses stretched his hand over the sea. A strong wind blew through the night. The water parted, and the families walked across on dry ground.",
          "Pharaoh’s army followed them into the path. After the Israelites crossed, the water came back. They were safe on the other side. The people saw what God had done and trusted him.",
        ],
        question: "How do you think the families felt when they reached the other shore?",
      },
      middle: {
        paragraphs: [
          "After the Israelites left Egypt, Pharaoh changed his mind and sent chariots after them. The Israelites were camped by the sea. They cried out and blamed Moses for bringing them there. Moses urged them to stand firm and see how the Lord would rescue them.",
          "God directed the Israelites to go forward. The pillar of cloud moved behind them, separating their camp from the Egyptian army. Moses extended his hand, and an east wind drove back the sea all night. The people crossed on dry ground.",
          "The chariots followed, but their wheels struggled. At dawn the waters returned, and the army was swept away. Exodus 14 ends with the people recognizing what God had done and putting their trust in the Lord and in Moses.",
        ],
        question: "How do Moses’ words in Exodus 14:13–14 and God’s instruction in verse 15 fit together?",
      },
      teen: {
        paragraphs: [
          "Exodus 13 explains that the Israelites are led away from the shorter route and guided by the pillar of cloud and fire. When Pharaoh pursues them in chapter 14, the people question whether freedom has only led them into danger. Moses promises deliverance.",
          "In the narrative God’s command to move forward comes alongside the promise that God will fight for the people. Moses stretches out his hand, the wind blows, and the pillar of cloud separates the camps. The passage gives attention both to God’s action and to the Israelites walking into the opened path.",
          "The Egyptians pursue the Israelites and are overtaken by the returning water. The ending puts their defeat beside the Israelites’ rescue and the people’s response of awe and trust. The next chapter turns the event into a song the community can remember together.",
        ],
        question: "Compare the people’s response in Exodus 14:10–12 with 14:30–31. What changes and what does the narrator say led to the change?",
      },
    },
  },
  {
    id: "samuel-hears-god", title: "Samuel Hears God", testament: "old",
    sceneTitles: ["A voice at night", "Eli understands", "Samuel listens"],
    reference: "1 Samuel 3", reading: "1 Samuel 3:1–10",
    teenReading: "1 Samuel 3:1–21", topic: "Listening and telling the truth",
    drawPrompt: "Color Samuel’s blanket and draw a warm glow around the lamp.",
    activity: {
      prompt: "Who helped Samuel understand the voice?",
      options: ["Eli", "David", "Moses"], answer: 0,
      explanation: "Eli understood that the Lord was calling Samuel and told him how to answer.",
    },
    editions: {
      young: {
        paragraphs: [
          "Samuel helped Eli serve God. One night Samuel lay down near the place where the lamp of God was still burning. He heard his name and ran to Eli. Eli said he had not called him.",
          "Samuel heard his name again and went back to Eli. The third time, Eli understood that the Lord was calling the boy. He told Samuel to lie down and ask God to speak because he was listening.",
          "The Lord called Samuel by name again. This time Samuel answered as Eli had taught him. God gave him a message, and Samuel listened. The next morning Samuel told Eli what he had heard.",
        ],
        question: "What did Eli do to help Samuel listen?",
      },
      middle: {
        paragraphs: [
          "Samuel served under Eli at the sanctuary. The writer says a word from the Lord was rare in those days. Before the lamp went out, Samuel heard his name and thought Eli needed him. Each time Samuel went to Eli, Eli sent him back to bed.",
          "After the third call, Eli realized who was speaking. He taught Samuel to answer as a servant ready to listen. When the Lord called again, Samuel did as Eli had said.",
          "The message concerned Eli’s household, and Samuel was afraid to repeat it. In the morning Eli asked him to tell everything, and Samuel did. As Samuel grew, the people came to recognize him as a prophet.",
        ],
        question: "How did Samuel show that he was willing to listen and tell the truth even when the message was hard?",
      },
      teen: {
        paragraphs: [
          "The account opens with two details. A word from the Lord is rare, and the lamp of God has not yet gone out. Samuel hears a voice but interprets it through the relationship he already knows, getting up each time to serve Eli.",
          "Eli eventually recognizes the speaker. His instruction gives Samuel a way to respond and a posture to take. Eli helps Samuel listen even though the message calls Eli’s own household to account.",
          "In the morning Samuel fears telling Eli what he heard. Eli asks him to speak fully, and Samuel tells him the whole message. By the end of the chapter Samuel is recognized publicly as a prophet, beginning with the difficult act of telling the truth to his mentor.",
        ],
        question: "What do Eli and Samuel each do to make it possible for a difficult message to be heard?",
      },
    },
  },
  {
    id: "zacchaeus", title: "Zacchaeus", testament: "new",
    sceneTitles: ["Up in the tree", "A guest at the table", "Making amends"],
    reference: "Luke 19:1–10", reading: "Luke 19:1–10", topic: "Welcome and making things right",
    drawPrompt: "Color the sycamore tree and draw the road Jesus takes through Jericho.",
    activity: {
      prompt: "What did Zacchaeus climb to see Jesus?",
      options: ["A hill", "A ladder", "A sycamore tree"], answer: 2,
      explanation: "Zacchaeus climbed a sycamore tree so he could see above the crowd.",
    },
    editions: {
      young: {
        paragraphs: [
          "Jesus was passing through Jericho. A man named Zacchaeus wanted to see him. Zacchaeus was short, and the crowd was in the way. He ran ahead and climbed a sycamore tree.",
          "Jesus looked up and called Zacchaeus by name. He asked Zacchaeus to come down because he was going to stay at his house. Zacchaeus hurried down and welcomed him happily.",
          "Some people complained because Jesus was visiting a man they thought had done wrong. Zacchaeus offered to share his money with people in need and pay back anyone he had cheated. Jesus said he had come to find and save people who were lost.",
        ],
        question: "What did Zacchaeus say he would do to make things right?",
      },
      middle: {
        paragraphs: [
          "Zacchaeus was a wealthy chief tax collector in Jericho. When Jesus passed through, Zacchaeus could not see past the crowd. He ran ahead and climbed a sycamore tree.",
          "Jesus stopped below the tree, called him by name, and said he must stay at his house. Zacchaeus welcomed Jesus gladly, but the crowd grumbled that Jesus had chosen to be the guest of a sinner.",
          "Zacchaeus told Jesus he would give half his possessions to the poor and repay anyone he had cheated four times what he had taken. Jesus spoke of salvation coming to the house. He ended by explaining that the Son of Man came to seek and save the lost.",
        ],
        question: "What is the difference between sharing with the poor and paying someone back? Why do both matter in this story?",
      },
      teen: {
        paragraphs: [
          "Luke names Zacchaeus’s wealth and position before describing his effort to see Jesus. Zacchaeus gets ahead of the crowd, but Jesus makes the encounter personal by looking up, naming him, and saying he will stay at his house.",
          "The scene places Zacchaeus’s joyful welcome beside the crowd’s complaint. The crowd’s label sums up how it sees him, while Jesus’s willingness to enter his house makes room for an encounter beyond that reputation.",
          "Zacchaeus names two concrete actions, giving to the poor and restoring fourfold what he has taken dishonestly. Jesus answers with a declaration of salvation and calls Zacchaeus a son of Abraham. The final verse explains the encounter in terms of Jesus’s mission to seek and save.",
        ],
        question: "How do Jesus’s welcome and Zacchaeus’s promises work together in the story? What would you miss by reading either part alone?",
      },
    },
  },
  {
    id: "lost-sheep", title: "The Lost Sheep", testament: "new",
    sceneTitles: ["A complaint about welcome", "One sheep is missing", "Joy when it is found"],
    reference: "Luke 15:1–7", reading: "Luke 15:1–7", topic: "Being found and welcomed",
    drawPrompt: "Color the hillside and draw the shepherd’s path home.",
    activity: {
      prompt: "What did the shepherd do when he found the sheep?",
      options: ["He put it on his shoulders", "He left it behind", "He put it on a boat"],
      answer: 0,
      explanation: "The shepherd carried the sheep on his shoulders and invited others to celebrate.",
    },
    editions: {
      young: {
        paragraphs: [
          "People came to listen to Jesus. Some teachers complained because Jesus welcomed people who had done wrong. Jesus answered with a story.",
          "A shepherd had one hundred sheep. When one was missing, he went looking for it. He kept searching until he found it. Then he put it on his shoulders and carried it home.",
          "The shepherd was so happy that he asked his friends and neighbors to celebrate with him. Jesus said there is joy in heaven when someone turns back to God.",
        ],
        question: "Why did the shepherd ask his neighbors to celebrate?",
      },
      middle: {
        paragraphs: [
          "Tax collectors and others were gathering to hear Jesus. Some religious leaders complained that he welcomed and ate with people they called sinners. Jesus responded with a parable.",
          "He asked what a person with one hundred sheep would do if one went missing. In the story the shepherd leaves the ninety-nine in the open country and searches until he finds the missing sheep. He carries it back on his shoulders, rejoicing.",
          "At home the shepherd calls his friends and neighbors to share his joy. Jesus connects that celebration to the joy in heaven over one sinner who repents. The ending answers the complaint about whom Jesus welcomes.",
        ],
        question: "How does the celebration at the end answer the complaint at the beginning?",
      },
      teen: {
        paragraphs: [
          "Luke places the parable in a public disagreement about meals and welcome. Some hearers draw near to Jesus, while critics grumble that he eats with sinners. Jesus directs a question back to them about a lost sheep.",
          "The search continues until the sheep is found. The shepherd’s response is to carry it home rejoicing. In a few lines the parable moves from the flock to the missing individual to a shared celebration with neighbors.",
          "Jesus interprets the shepherd’s joy as joy in heaven over a sinner who repents. The story starts with a complaint about hospitality and ends with an invitation to rejoice. Its frame gives the listeners a choice about how to respond when someone is found.",
        ],
        question: "What does the shared celebration add to the parable’s answer to the people who grumbled?",
      },
    },
  },
  {
    id: "wise-builders", title: "The Wise and Foolish Builders", testament: "new",
    sceneTitles: ["Two people hear", "The storm comes", "What the houses show"],
    reference: "Matthew 7:24–27", reading: "Matthew 7:24–27",
    teenReading: "Matthew 7:21–29", topic: "Listening and putting words into practice",
    drawPrompt: "Color the rock under one house and draw rain coming down on both houses.",
    activity: {
      prompt: "What did the wise builder build on?",
      options: ["Sand", "A pile of leaves", "Rock"], answer: 2,
      explanation: "The house built on rock stood through the storm.",
    },
    editions: {
      young: {
        paragraphs: [
          "Jesus told a story about two builders. One built a house on a rock. The other built a house on sand.",
          "Rain came down and water rose. The wind blew against both houses. The house on rock stayed up. The house on sand fell with a crash.",
          "Jesus said that when we hear his words and do what they say, we are like the builder who built on rock. He wanted people to put his words into practice.",
        ],
        question: "What did Jesus say a wise person does after hearing his words?",
      },
      middle: {
        paragraphs: [
          "Jesus ends the Sermon on the Mount with two builders. The first represents someone who hears Jesus’s words and acts on them. That person is like a builder who sets a house on rock.",
          "The second builder represents someone who hears the same words and does not act on them. That house is built on sand. Rain, floodwater, and wind hit both houses.",
          "The house on rock stands, and the house on sand falls. The storm reveals what each builder chose before the rain began. The picture calls Jesus’s listeners to act on what they have heard.",
        ],
        question: "What do the two builders have in common, and what choice makes their houses turn out differently?",
      },
      teen: {
        paragraphs: [
          "The illustration comes at the end of the Sermon on the Mount. Earlier in Matthew 7:21–23, Jesus distinguishes speaking the right words from doing the Father’s will. The building story gives the distinction a concrete picture.",
          "The two people both hear Jesus. Both build, and both face rain, floods, and wind. The repeated description of the storm keeps the comparison centered on the foundation each person chose.",
          "The house founded on rock withstands the storm, while the house on sand collapses. Matthew then describes the crowd’s astonishment at Jesus’s authority. The placement invites readers to consider what they will do with the teaching they just heard.",
        ],
        question: "Choose one teaching from Matthew 5–7. What would putting it into practice look like in an ordinary week?",
      },
    },
  },
];
