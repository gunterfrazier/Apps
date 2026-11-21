import type { FamilyStory } from "./family-stories";

const publicDomain = { license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/" };

export const NEW_FAMILY_STORIES: FamilyStory[] = [
  {
    id: "creation",
    title: "God makes the world",
    testament: "old",
    reference: "Genesis 1:1–2:3",
    reading: "Genesis 1:1–13; Genesis 2:1–3",
    teenReading: "Genesis 1:1–2:3",
    topic: "Creation and care",
    drawPrompt: "Color the sky, the sea, and the land. Draw one more thing God made.",
    sceneTitles: ["Light in the darkness", "Sky, seas, and land", "A world filled with life", "A day of rest"],
    image: {
      ...publicDomain, file: "creation.webp", alt: "A bright opening appears above dark water in a swirling sky.",
      credit: "The Creation, James Tissot",
      source: "https://commons.wikimedia.org/wiki/File:Tissot_The_Creation.jpg",
    },
    activity: {
      prompt: "What did God do on the seventh day?",
      options: ["Made the sea", "Rested and blessed the day", "Made the birds"],
      answer: 1, explanation: "God rested from the work of creation and set the seventh day apart.",
    },
    editions: {
      young: {
        paragraphs: [
          "At the beginning, darkness lay over deep water. God spoke, and there was light. God called the light day and the darkness night. The first evening and morning passed.",
          "God made the sky. Then God gathered the waters so dry ground could appear. God named the dry ground land and the waters seas. Soon the land grew plants and trees with fruit.",
          "God made lights for the sky, creatures to swim in the water, and birds to fly above the land. Then came animals that lived on land. God made people in his own image and gave them a world full of life to care for.",
          "God looked at everything he had made and called it very good. When the work was finished, God rested. He blessed the seventh day and set it apart.",
        ],
        question: "Which part of the world in this story would you like to explore? How could you take care of it?",
      },
      middle: {
        paragraphs: [
          "Genesis begins with God creating the heavens and the earth. At first the earth is unformed, darkness covers the deep, and God’s Spirit moves over the waters. God calls light into being and gives names to the light and the darkness.",
          "God separates waters to make the sky. The waters below gather into seas so dry ground can appear. The ground grows plants that produce seed and trees that bear fruit. These early scenes give the world places where life can grow.",
          "Lights mark the passage of time. Fish and other creatures fill the waters, birds fill the sky, and animals live on land. God makes human beings in his image, blesses them, and gives them responsibility for the living world.",
          "The repeated words that creation is good build toward God calling everything very good. The seventh day has a different purpose. God finishes the work, rests, and blesses that day.",
        ],
        question: "What responsibilities go with being given a world that God calls good?",
      },
      teen: {
        paragraphs: [
          "Genesis opens with darkness and a watery deep. God’s speech begins ordering that world. Watch for the repeated sequence of God speaking, something happening, and God looking at the result. The repetitions help readers follow the movement of the chapter.",
          "The first three days describe light and darkness, waters and sky, then land, seas, and vegetation. Notice how the next three days return to those spaces in order. The passage uses that structure to draw attention to the relationships among the parts of creation.",
          "Days four through six fill the ordered world with lights and living creatures. The account slows down when God makes humanity. Both male and female bear God’s image. The blessing and charge that follow connect that identity with responsibility for the rest of creation.",
          "Genesis 2:1–3 closes the sequence with God blessing a day. The culmination of the work is rest. Read the final verses alongside Genesis 1:31 and consider what the text treats as the goal of the work.",
        ],
        question: "How do the words image, good, and rest shape what this passage says about a human life?",
      },
    },
  },
  {
    id: "joseph",
    title: "Joseph and his brothers",
    testament: "old",
    reference: "Genesis 37, 39–45",
    reading: "Genesis 37:3–11; Genesis 41:53–57; Genesis 45:1–11",
    teenReading: "Genesis 37:18–28; Genesis 41:25–36; Genesis 44:18–34; Genesis 45:1–15",
    topic: "Jealousy, courage, and forgiveness",
    drawPrompt: "Give Joseph’s coat bright stripes. Choose a different color for each stripe.",
    sceneTitles: ["The coat and the dreams", "Far from home", "A plan for the years of hunger", "Joseph reveals his name"],
    image: {
      file: "joseph.webp", alt: "Joseph reveals who he is to his brothers in Egypt.",
      credit: "Joseph Revealing Himself to His Brothers in Egypt, studio of Pier Francesco Mola · National Gallery of Art",
      source: "https://www.nga.gov/artworks/56356-joseph-revealing-himself-his-brothers-egypt",
      license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    activity: {
      prompt: "Why did Joseph’s brothers go to Egypt?",
      options: ["To buy grain", "To see a new palace", "To look for sheep"],
      answer: 0, explanation: "There was a famine at home, and Egypt had grain because Joseph had stored it.",
    },
    editions: {
      young: {
        paragraphs: [
          "Joseph’s father gave him a special coat. Joseph also had dreams in which his family bowed to him. His brothers grew jealous. One day, far from home, they threw him into a pit and sold him to traders.",
          "The traders took Joseph to Egypt. He worked in another man’s house and later ended up in prison after someone accused him of something he had not done. While there, Joseph helped two prisoners understand their dreams.",
          "When Pharaoh, the king of Egypt, had strange dreams, Joseph explained their meaning. Years of good harvests would be followed by years with little food. Pharaoh put Joseph in charge of storing grain while there was plenty.",
          "During the famine, Joseph’s brothers came to Egypt to buy grain. They did not recognize him at first. Later Joseph told them who he was. He wept, embraced them, and asked them to bring their father to Egypt, where the family could have food.",
        ],
        question: "What do you notice about how Joseph treated his brothers when he could have sent them away?",
      },
      middle: {
        paragraphs: [
          "Jacob gave Joseph a special robe, and his brothers saw how much their father favored him. When Joseph shared his dreams of the family bowing to him, their anger grew. One day they dropped Joseph into an empty pit. He was sold to traders, and the brothers let Jacob believe he was dead.",
          "In Egypt Joseph served in Potiphar’s household. After a false accusation, he was imprisoned. Two of Pharaoh’s officials had dreams there. Joseph told them that God could give the meanings, and the events happened as he said. The cupbearer was restored to his job and forgot Joseph for a time.",
          "Pharaoh later dreamed of seven thin cows swallowing seven healthy ones and seven thin heads of grain swallowing good grain. Joseph explained that seven years of plenty would be followed by seven years of famine. Pharaoh placed him over the work of collecting and storing food.",
          "Joseph recognized his brothers when they came for grain. After several meetings, he saw Judah offer to take Benjamin’s place as a servant. Joseph sent the other people out of the room, wept, and said who he was. He told his brothers to bring their father to Egypt so the family could survive the famine.",
        ],
        question: "What does Judah’s offer to take Benjamin’s place show about the way he has changed?",
      },
      teen: {
        paragraphs: [
          "Genesis 37 shows jealousy growing inside a family. Jacob’s favor, the robe, and Joseph’s dreams become part of the brothers’ anger. Reuben speaks against killing Joseph, while Judah proposes selling him. Keep their choices in view when the brothers have to decide what to do about Benjamin later.",
          "Joseph’s position changes more than once in Egypt. A trusted servant becomes a prisoner after a false accusation. In prison, he credits God with the interpretation of dreams. The cupbearer’s delay leaves Joseph waiting even after an interpretation has proved true.",
          "In Genesis 41, Joseph interprets Pharaoh’s two dreams as one message and proposes a response. Grain must be gathered during the years of plenty if people are to survive the famine. The story connects Joseph’s ability to interpret the dreams with the practical work of planning ahead.",
          "Judah’s speech in Genesis 44 offers himself in place of Benjamin and recalls what another loss would do to Jacob. In Genesis 45 Joseph identifies himself and speaks of God preserving life. Read his words alongside the brothers’ earlier actions and consider how the story holds harm, responsibility, and forgiveness together.",
        ],
        question: "What evidence does Genesis give that Judah has changed, and what does Joseph do with the power he now has?",
      },
    },
  },
  {
    id: "ruth",
    title: "Ruth stays with Naomi",
    testament: "old",
    reference: "Ruth 1–4",
    reading: "Ruth 1:14–18; Ruth 2:8–18; Ruth 4:13–17",
    teenReading: "Ruth 1:6–18; Ruth 2:5–16; Ruth 4:1–17",
    topic: "Loyalty and practical kindness",
    drawPrompt: "Color the barley that Ruth gathers. Draw a basket for the grain she brings home.",
    sceneTitles: ["Naomi prepares to leave", "Ruth chooses to stay", "Grain in the field", "A family after harvest"],
    image: {
      ...publicDomain, file: "ruth.webp", alt: "Ruth meets Boaz among the people harvesting his field.",
      credit: "Ruth in the Field of Boaz, Julius Schnorr von Carolsfeld",
      source: "https://commons.wikimedia.org/wiki/File:Julius_Schnorr_von_Carolsfeld-_Ruth_im_Feld_des_Boaz.jpg",
    },
    activity: {
      prompt: "How did Ruth find food for herself and Naomi?",
      options: ["She caught fish", "She gathered grain left by workers", "She baked bread for the town"],
      answer: 1, explanation: "Ruth gathered leftover grain in Boaz’s field and brought it home to Naomi.",
    },
    editions: {
      young: {
        paragraphs: [
          "Naomi’s family had left Bethlehem when food was scarce and moved to Moab. Naomi’s husband and sons died there. When she heard that there was food in Bethlehem again, she decided to go home.",
          "Naomi told her daughters-in-law, Ruth and Orpah, that they could stay in Moab. Orpah said goodbye. Ruth stayed with Naomi and promised to go where she went and to worship her God.",
          "In Bethlehem, Ruth gathered grain the harvest workers had left behind. The field belonged to Boaz. When he learned how Ruth had cared for Naomi, he invited her to gather grain safely there and gave her food to eat.",
          "Ruth took her grain and some food she had saved to Naomi. She kept working through the harvest. Later Boaz and Ruth married. They had a son named Obed, and Naomi helped care for him.",
        ],
        question: "What is one thing Ruth or Boaz did that you could do in your own way to help someone?",
      },
      middle: {
        paragraphs: [
          "A famine took Naomi, her husband, and their sons from Bethlehem to Moab. After Naomi lost her husband and both sons, she heard that food was available in Judah again. She started home with her daughters-in-law, Orpah and Ruth.",
          "Naomi urged the women to return to their families. Orpah kissed her goodbye. Ruth held on to Naomi and promised to share her journey, her people, and her God. They reached Bethlehem at the beginning of the barley harvest.",
          "Ruth went to glean, which meant picking up grain the harvesters left behind. She came to a field belonging to Boaz, a relative of Naomi’s family. Boaz told his workers to keep her safe, invited her to eat, and asked the workers to leave extra grain for her.",
          "Ruth and Naomi had help through the harvest. Boaz later spoke to a nearer relative and the town elders before agreeing to marry Ruth. Their son Obed became the grandfather of David. The women of Bethlehem celebrated with Naomi.",
        ],
        question: "How did Boaz help Ruth keep working and providing for Naomi?",
      },
      teen: {
        paragraphs: [
          "The book begins with hunger, migration, and loss. Naomi’s return comes after she hears that food is available in Judah. The opening also makes clear that Ruth begins this journey as a Moabite woman with a future she has to choose.",
          "Orpah returns after Naomi’s urging. Ruth binds herself to Naomi, to her people, and to her God. The women arrive at harvest, a detail that sets up the field scenes and stands in contrast to the famine that began the story.",
          "Ruth goes out to glean. The field belongs to Boaz, who asks about her, recognizes what she has done for Naomi, and tells the men to leave her alone and leave her extra grain. Notice how safety, food, and work all matter to the kindness of this scene.",
          "At the town gate, Boaz resolves the question of the nearer relative before he marries Ruth. The closing scene draws attention to Naomi caring for Obed and continues into a genealogy ending with David. Read how far the book has traveled from Naomi’s first return to Bethlehem.",
        ],
        question: "What makes kindness in Ruth practical, and what would that kind of support look like in a community today?",
      },
    },
  },
  {
    id: "feeding-the-crowd",
    title: "Jesus feeds the five thousand",
    testament: "new",
    reference: "John 6:1–15",
    reading: "John 6:1–13",
    teenReading: "John 6:1–15; John 6:26–35",
    topic: "Jesus provides for the crowd",
    drawPrompt: "Color the bread and fish. Draw another basket for the food left over.",
    sceneTitles: ["The crowd on the hillside", "The boy’s food", "Everyone has enough", "Twelve baskets"],
    image: {
      ...publicDomain, file: "feeding-the-crowd.webp", alt: "A large crowd spread across a hillside beside the Sea of Galilee.",
      credit: "The Miracle of the Loaves and Fishes, James Tissot · Brooklyn Museum",
      source: "https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Miracle_of_the_Loaves_and_Fishes_(La_multiplication_des_pains)_by_James_Tissot.jpg",
    },
    activity: {
      prompt: "How many baskets of pieces were left after everyone ate?",
      options: ["Two", "Five", "Twelve"],
      answer: 2, explanation: "The disciples filled twelve baskets with pieces left over from the five barley loaves.",
    },
    editions: {
      young: {
        paragraphs: [
          "Jesus went up a hillside near the Sea of Galilee. A big crowd followed because they had seen him heal people. When Jesus looked up and saw them coming, he asked his friend Philip where they could get bread for everyone.",
          "Philip thought even a great deal of money would not buy enough. Another friend, Andrew, found a boy with five barley loaves and two fish. Andrew wondered how so little could feed all those people.",
          "Jesus asked the people to sit on the grass. He took the bread and gave thanks to God. Then he shared the bread and fish. Everyone had as much as they wanted.",
          "When everyone had eaten, Jesus asked his friends to collect the pieces so they would not be wasted. They filled twelve baskets. They had started with a little meal, and now there was food left over.",
        ],
        question: "What would you have noticed when the baskets came back full?",
      },
      middle: {
        paragraphs: [
          "A crowd crossed toward Jesus near the Sea of Galilee after seeing his signs of healing. John mentions that Passover was near. Jesus sat on a hillside with his disciples and asked Philip where they could buy enough bread for the crowd.",
          "Philip calculated that even two hundred denarii would not buy enough for everyone to have a little. Andrew pointed out a boy with five barley loaves and two fish. The disciples could see both the food in front of them and how large the crowd was.",
          "Jesus asked everyone to sit in the grassy place. John says there were about five thousand men. Jesus gave thanks and distributed bread and fish to the people, who ate as much as they wanted.",
          "At Jesus’ direction, the disciples gathered the leftover pieces and filled twelve baskets. The people called Jesus the Prophet they were expecting. When Jesus realized they meant to take him and make him king, he withdrew to the mountain alone.",
        ],
        question: "How do Philip’s estimate and the twelve baskets help tell the story from beginning to end?",
      },
      teen: {
        paragraphs: [
          "John 6 places the feeding near Passover and describes a crowd drawn by Jesus’ signs of healing. Jesus asks Philip about buying bread. John tells readers that Jesus already knows what he will do, making the question an invitation to see how the disciples understand the need.",
          "Philip thinks about wages and cost. Andrew names a boy’s five barley loaves and two fish while admitting their smallness compared with the crowd. The ordinary details prepare the reader to notice how the outcome differs from what either disciple expects.",
          "Jesus has the people sit, gives thanks, and distributes food. Everyone can eat until satisfied. He then tells the disciples to gather the fragments. John records both the abundance and Jesus’ desire that the remaining bread be collected.",
          "The crowd calls Jesus the Prophet and wants to make him king. Jesus withdraws. Later he speaks about bread that lasts and calls himself the bread of life. The feeding meets a real hunger and opens a conversation about what the crowd is seeking from him.",
        ],
        question: "How does the conversation in John 6:26–35 change what you notice in the feeding story?",
      },
    },
  },
  {
    id: "resurrection",
    title: "Jesus is risen",
    testament: "new",
    reference: "Matthew 28:1–10",
    reading: "Matthew 28:1–10",
    teenReading: "Matthew 27:57–66; Matthew 28:1–10",
    topic: "Resurrection and hope",
    drawPrompt: "Color the empty tomb. Draw the morning sun above the stone that was rolled away.",
    sceneTitles: ["Early at the tomb", "The stone is moved", "Fear and joy", "Jesus meets them"],
    image: {
      ...publicDomain, file: "resurrection.webp", alt: "Mary Magdalene and other women come to the tomb.",
      credit: "Mary Magdalene and the Holy Women at the Tomb, James Tissot · Brooklyn Museum",
      source: "https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_Mary_Magdalene_and_the_Holy_Women_at_the_Tomb_(Madeleine_et_les_saintes_femmes_au_tombeau)_-_James_Tissot.jpg",
    },
    activity: {
      prompt: "What news did the angel tell the women?",
      options: ["Jesus was still in the tomb", "Jesus had risen", "They should go back the next day"],
      answer: 1, explanation: "The angel said that Jesus had risen and told the women to share the news with his disciples.",
    },
    editions: {
      young: {
        paragraphs: [
          "After Jesus died, his body was placed in a tomb with a large stone across its doorway. Early on the first day of the week, Mary Magdalene and another woman named Mary came to see the tomb.",
          "The ground shook, and an angel rolled the stone away and sat on it. The guards were very afraid. The angel told the women they could come and see the place where Jesus had been. Jesus had risen.",
          "The angel asked the women to tell Jesus’ friends that he was alive and would meet them in Galilee. The women hurried away. They were afraid and full of joy at the same time.",
          "On the way, Jesus met them and greeted them. The women held his feet and worshiped him. Jesus told them not to be afraid and asked them again to carry the news to his friends.",
        ],
        question: "How do you think the women felt when they saw Jesus on the way?",
      },
      middle: {
        paragraphs: [
          "After Jesus’ death, Joseph of Arimathea placed his body in a new tomb cut from rock and rolled a great stone across the entrance. Matthew says the tomb was secured and guarded. At dawn after the Sabbath, Mary Magdalene and the other Mary went to see it.",
          "A strong earthquake accompanied the arrival of an angel. The angel rolled the stone back and sat on it. The guards shook with fear. The angel told the women not to be afraid and invited them to see where Jesus had lain.",
          "The angel said Jesus had risen, as he had told them he would. The women were to tell the disciples that Jesus was going ahead of them to Galilee. They left in a hurry with fear and great joy.",
          "Jesus himself met the women before they reached the disciples. They took hold of his feet and worshiped him. Jesus repeated the message about Galilee and called the disciples his brothers.",
        ],
        question: "How is meeting Jesus on the road different from hearing the angel’s message at the tomb?",
      },
      teen: {
        paragraphs: [
          "Read Matthew’s burial account alongside the resurrection scene. At the burial, the two Marys watch across from the tomb. When the story returns to them, they go to the same place, now guarded and sealed. Matthew uses the continuity to connect the death, burial, and discovery.",
          "The angel rolls the stone away and sits on it. The guards shake, while the women hear the command not to fear. They are invited to see the empty place and to understand it in light of what Jesus had already said.",
          "The women are sent from the tomb toward the disciples with news that Jesus will meet them in Galilee. Matthew describes them as afraid and joyful at once. Their response is to go and carry the message they have heard.",
          "Before they reach the others, the women meet Jesus himself and worship him. He repeats the commission, calling the disciples his brothers. Consider how the story moves from seeking a tomb to being sent out with news of someone they have met.",
        ],
        question: "What changes between the women’s visit to the tomb and their meeting with Jesus, and why does Matthew include both scenes?",
      },
    },
  },
];
