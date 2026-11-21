import type { AgeGroup } from "./family";

interface StoryCraft {
  title: string;
  minutes: number;
  supplies: string[];
  steps: Partial<Record<AgeGroup, string[]>>;
  artTile: number;
  artAlt: string;
}

interface StoryCollection {
  craft: StoryCraft;
  play: Partial<Record<AgeGroup, { title: string; instructions: string }>>;
}

export const STORY_COLLECTIONS: Partial<Record<string, StoryCollection>> = {
  noah: {
    craft: {
      title: "Make a rainbow promise wheel",
      minutes: 15,
      supplies: ["Card or thick paper", "Crayons", "Scissors", "A paper fastener"],
      steps: {
        young: ["Ask an adult to cut out a circle and an arrow.", "Color a rainbow at the top of the circle. Add two clouds and a little ark.", "Ask an adult to fasten the arrow in the middle. Point it to the ark, then the rainbow, as you tell the story."],
        middle: ["Divide a paper circle into four sections. Draw the ark, the dove, dry land, and the rainbow in story order.", "Make a paper pointer and attach it in the middle.", "Use the wheel to retell the story. Match each picture to a verse in Genesis 8–9."],
        teen: ["Divide a paper circle into three sections labeled Sign, Promise, and Recipients.", "Use Genesis 9:8–17 to draw a symbol and cite a verse in each section.", "Attach a paper pointer. Have a partner choose a section and explain how it connects to the other two."],
      },
      artTile: 0,
      artAlt: "A paper wheel with a rainbow, clouds, and a blue pointer.",
    },
    play: {
      young: { title: "Animal pairs", instructions: "Name an animal from the ark. Have a partner copy its sound or movement. Switch turns and see how many pairs you can make." },
      middle: { title: "The dove’s three trips", instructions: "Act out each trip. Have a partner guess whether the dove returns empty, comes back with a leaf, or stays away. Check your order in Genesis 8:8–12." },
      teen: { title: "Who is included?", instructions: "Read Genesis 9:8–17 aloud together. Each time the promise mentions a recipient, make a tally. Compare your lists and discuss which details are easy to overlook." },
    },
  },
  ruth: {
    craft: {
      title: "Weave a harvest basket",
      minutes: 20,
      supplies: ["Two colors of paper", "Scissors", "Tape", "Pencil or markers"],
      steps: {
        young: ["Ask an adult to cut a basket shape and short strips in another color.", "Lay strips across the basket and tape their ends down.", "Draw and cut out pieces of barley. Add them to the basket one at a time as you tell how Ruth helped Naomi."],
        middle: ["Fold the basket shape and cut parallel slits, stopping short of the edges.", "Weave narrow strips over and under the slits. Tape their ends down.", "Add paper barley stems. Write one action Ruth or Boaz took on each stem."],
        teen: ["Weave a paper basket using parallel slits and strips, or draw an interwoven basket.", "Cut three paper stems labeled Ruth, Naomi, and Boaz. On each, record one choice and its effect on another person.", "Use the finished basket to explain how individual decisions changed what was possible for the others."],
      },
      artTile: 1,
      artAlt: "A woven paper basket with green barley stems.",
    },
    play: {
      young: { title: "Gather and share", instructions: "Scatter folded paper scraps as pretend grain. Take turns gathering them and sharing the pile. Name one way you can share something with a person this week." },
      middle: { title: "Follow the choices", instructions: "Take turns naming a choice Ruth, Naomi, or Boaz makes. Before the next turn, explain how that choice changes things for someone else in the story." },
      teen: { title: "Trace the help in Ruth 2", instructions: "Read Ruth 2:8–18 together. One person tracks what Ruth does and the other tracks what Boaz does. Where do you see help that protects Ruth’s ability to act?" },
    },
  },
  samaritan: {
    craft: {
      title: "Make a neighbor-care card",
      minutes: 15,
      supplies: ["Paper", "Markers", "Tape", "Adhesive bandages or cut paper strips"],
      steps: {
        young: ["Fold a sheet of paper in half and draw a big heart on the front.", "Put two bandages or paper strips across the heart.", "Draw one kind thing you can do inside. Give the card to someone with an adult’s help."],
        middle: ["Fold a card and decorate the cover with a heart and crossed paper strips.", "Inside, draw three small scenes showing how the Samaritan noticed, acted, and followed through.", "Add one concrete way you can do each of those things for a neighbor."],
        teen: ["Make a fold-out card with three panels called Notice, Act, and Follow through.", "Use Luke 10:33–35 to write one detail in each panel.", "On the back, sketch a realistic plan to help someone with their agreement, including one follow-up step."],
      },
      artTile: 2,
      artAlt: "A mint-green card decorated with a red heart and two crossed bandages.",
    },
    play: {
      young: { title: "What could a helper do?", instructions: "Have an adult act out dropping a pencil, looking for a book, or feeling left out. Take turns showing one kind way to respond." },
      middle: { title: "Freeze and help", instructions: "Pause an acted-out scene from the story just before the Samaritan helps. Suggest a next action, then read Luke 10:33–35 and compare your idea with what he does." },
      teen: { title: "Switch the question", instructions: "Read the opening and closing questions in Luke 10:25–37. In pairs, rewrite both in everyday language and test how each question changes the way you respond to the same situation." },
    },
  },
  "burning-bush": {
    craft: {
      title: "Make a burning bush paper collage",
      minutes: 15,
      supplies: ["Blue, brown, and green paper", "Red, orange, or yellow tissue paper", "Glue stick", "Scissors"],
      steps: {
        young: ["Glue a brown trunk and green leaves onto the blue paper.", "Tear colored tissue into flame shapes and glue them around the leaves. Leave green patches showing.", "Point to the leaves and tell someone why Moses stopped to look."],
        middle: ["Cut out a trunk, branches, and green leaves. Layer torn tissue around the bush so both the flames and the leaves stay visible.", "Add three paper labels for what Moses saw, heard, and was asked to do.", "Write a short phrase from the story on each label and place it beside your collage."],
        teen: ["Make the collage with a clear focus on the intact green leaves and bright paper flames.", "Arrange three cards around it with Exodus 3:7, 3:10, and 3:12. Sketch a symbol for what God sees, asks, and promises.", "Use the arrangement to explain how the promise of presence supports the commission."],
      },
      artTile: 3,
      artAlt: "A paper collage of green leaves and tissue-paper flames on a blue background.",
    },
    play: {
      young: { title: "See, stop, listen", instructions: "Take three pretend steps with Moses and stop when a partner says ‘bush!’ Point to what surprised him, then use a pretend listening pose when his name is called." },
      middle: { title: "Put the conversation in order", instructions: "Write four cards for Moses seeing the bush, hearing his name, being sent to Pharaoh, and hearing God’s promise. Mix them up, reorder them, and verify the sequence in Exodus 3." },
      teen: { title: "Questions and answers", instructions: "Pair up and split Exodus 3:11–15 and 4:10–17. Each person reads one exchange aloud and describes what changes between Moses’ question and the answer. Compare your findings." },
    },
  },
  creation: {
    craft: {
      title: "Fold a creation accordion book",
      minutes: 20,
      supplies: ["Paper", "Tape", "Crayons or markers"],
      steps: {
        young: ["Ask an adult to fold a long strip of paper like a fan so it has seven panels.", "Draw a picture for each day as someone reads Genesis 1:1–2:3 with you. Save the last panel for a picture of rest.", "Unfold the strip and tell the story one panel at a time."],
        middle: ["Fold or tape together seven panels.", "Pair the first three panels with the next three. Mark the connections between light and lights, sky and water and their creatures, and land and its creatures.", "Add a seventh panel for rest and explain what it contributes to the story."],
        teen: ["Turn seven folded panels into a visual outline of Genesis 1:1–2:3.", "Add a brief verse citation for each image and use matching colors to connect related days.", "Use the final panel to show how the seventh day differs from the others."],
      },
      artTile: 4,
      artAlt: "A colorful folded paper book with scenes of water, land, birds, and the sky.",
    },
    play: {
      young: { title: "Move through the days", instructions: "Ask someone to name light, waves, plants, stars, birds, or animals. Make a motion for each. End the game with a quiet pause for the seventh day." },
      middle: { title: "Match the days", instructions: "Write or draw the main events of the first six days on slips of paper. Make three pairs that share a setting or theme. Open Genesis 1 to explain your matches." },
      teen: { title: "Read the repeated words", instructions: "Read Genesis 1 aloud and assign one person each to track speaking, naming, and calling things good. Compare which details the repeated patterns help you notice." },
    },
  },
  joseph: {
    craft: {
      title: "Make Joseph’s colorful coat",
      minutes: 15,
      supplies: ["Colored paper", "Scissors", "Glue stick", "Markers"],
      steps: {
        young: ["Ask an adult to cut out a coat shape.", "Glue bright paper stripes onto it.", "Turn it over and draw Joseph helping his family when they needed food."],
        middle: ["Cut out a coat shape and strips of paper.", "Write a scene from Genesis 37 or 45 on each strip. Glue them in story order.", "Use a different color for moments when Joseph or his brothers made a choice."],
        teen: ["Cut out a coat shape and add three wide strips.", "Use one strip for what Jacob does in Genesis 37:3, one for the brothers’ response in 37:4, and one for Joseph’s actions in 45:4–11.", "Draw a symbol on each strip and write how its scene changes the family relationships."],
      },
      artTile: 5,
      artAlt: "A cut-paper coat made from brightly colored paper stripes.",
    },
    play: {
      young: { title: "Guess Joseph’s feeling", instructions: "Take turns showing how Joseph might feel when he gets the coat, when he is away from his family, and when he sees his brothers again. Tell what happened in each scene." },
      middle: { title: "Three scenes, three clues", instructions: "Write one clue for the coat, Joseph’s food supplies in Egypt, and the family reunion. Shuffle the clues and compete to put them in order. Explain how the famine connects the second and third scenes." },
      teen: { title: "Compare what each person knows", instructions: "Read Genesis 45:1–8 in pairs. One person tracks what Joseph knows and the other tracks what his brothers know. Mark the sentence that changes what they can say to one another." },
    },
  },
  galilee: {
    craft: {
      title: "Make a rocking storm boat",
      minutes: 15,
      supplies: ["Paper plate or card", "Blue and brown paper", "Scissors", "Glue stick", "Markers"],
      steps: {
        young: ["Fold a paper plate in half so it rocks on the curved edge.", "Glue on blue waves and a brown paper boat. Draw the people inside.", "Rock the boat while someone tells the storm scene, then let it rest as Jesus calms the water."],
        middle: ["Make a rocking base from a folded paper plate and attach a cut-paper boat.", "Add a wave to one side and a quiet sea to the other.", "Write the disciples’ question from Mark 4:38 on one side and their question from 4:41 on the other."],
        teen: ["Build a rocking paper boat and cut out a rough sea and a still sea.", "Use the two sides to contrast the disciples’ reaction before and after Jesus speaks.", "Write one short line of dialogue from Mark 4:35–41 on each side and explain what the contrast reveals."],
      },
      artTile: 6,
      artAlt: "A folded paper plate boat with a white sail and blue waves.",
    },
    play: {
      young: { title: "Storm sounds", instructions: "Pat your knees softly for waves. Make the sounds louder as the storm grows, then stop together when a reader reaches the moment Jesus speaks." },
      middle: { title: "Act out the change", instructions: "Choose someone to read Mark 4:35–41. Freeze as a group before and after Jesus speaks. Guess which part of the passage each pose represents." },
      teen: { title: "Listen to both questions", instructions: "Read Mark 4:35–41 in pairs. Give one person each of the disciples’ questions. Describe what prompted it and what it tells you about their reaction to Jesus." },
    },
  },
  "jesus-welcomes-children": {
    craft: {
      title: "Make a welcome circle",
      minutes: 15,
      supplies: ["Colored paper", "Scissors", "Glue stick", "Markers"],
      steps: {
        young: ["Ask an adult to trace and cut out paper hands.", "Glue the hands around a big paper heart.", "Draw a way you could invite another child to join you, then show someone your picture."],
        middle: ["Trace and cut out four hands in different colors.", "On three hands, show what the adults bringing children, the disciples, and Jesus do in Mark 10:13–16.", "On the last hand, draw one action that helps a newcomer feel included."],
        teen: ["Arrange paper hands around a heart and assign each hand a viewpoint from Mark 10:13–16.", "On each hand, add the verse and a short paraphrase of what the person does.", "Add a concrete action the group could take to make its space more welcoming."],
      },
      artTile: 7,
      artAlt: "A circle of colorful paper handprints around a heart.",
    },
    play: {
      young: { title: "Make room", instructions: "Use pillows as seats. Take turns pretending to be someone new. See how many ways you can make room and invite them to sit with you." },
      middle: { title: "Three viewpoints", instructions: "Retell Mark 10:13–16 in three voices. One person brings a child, one plays a disciple, and one describes what Jesus does. Compare how the scene looks from each place." },
      teen: { title: "Whose voice comes through?", instructions: "List who speaks, who acts, and who is spoken about in Mark 10:13–16. Discuss how Jesus responds to the people with the least power in the scene." },
    },
  },
  "prodigal-son": {
    craft: {
      title: "Build a welcome-home doorway",
      minutes: 20,
      supplies: ["Card or thick paper", "Colored paper", "Scissors", "Glue stick", "Tape", "Markers"],
      steps: {
        young: ["Fold a card in half and ask an adult to cut out a paper door.", "Glue the door to the front and draw the father and son meeting on a path inside.", "Open the card and tell what the father did when he saw his son."],
        middle: ["Fold the card and attach a paper door with a taped hinge.", "Inside, draw the father running toward his younger son. Draw the older brother outside on the back.", "Write one line the father says to each son and show where each line fits."],
        teen: ["Make a hinged doorway card with one son on each side.", "Under each scene, add one sentence from Luke 15:11–32 showing how the father addresses that son.", "Use the inside of the door to write a question the parable leaves open."],
      },
      artTile: 8,
      artAlt: "An open paper card with an orange doorway and figures meeting on a path.",
    },
    play: {
      young: { title: "A welcome home", instructions: "Take turns pretending to walk up a path. The other person acts out the father spotting the son and rushing to greet him. Name one kind way to welcome someone." },
      middle: { title: "Find the missing scene", instructions: "One person retells the story and leaves out one event. A partner identifies what is missing and where it belongs. Switch and try the older brother’s part." },
      teen: { title: "Interview the two brothers", instructions: "Assign each person a brother and ask why he stays, leaves, or returns. Answer with evidence from Luke 15. End by naming one question the text leaves unanswered." },
    },
  },
  "feeding-the-crowd": {
    craft: {
      title: "Make a loaves-and-fish picnic card",
      minutes: 15,
      supplies: ["Colored paper", "Scissors", "Glue stick", "Markers"],
      steps: {
        young: ["Fold a sheet of paper into a picnic mat.", "Cut out five paper loaves and two fish with an adult’s help.", "Place them on the mat and count them as you tell the story."],
        middle: ["Fold a paper picnic card and add five loaves and two fish.", "Draw a crowd on the outside and twelve leftover baskets on the back.", "Label the three parts with events from John 6:1–13."],
        teen: ["Fold a card into three panels for need, provision, and leftovers.", "Use paper loaves, fish, and baskets to show how the amounts change.", "Add a verse to each panel and use the finished card to explain the movement of the scene in John 6:1–13."],
      },
      artTile: 9,
      artAlt: "A paper picnic card with small paper loaves and two blue fish.",
    },
    play: {
      young: { title: "Count the picnic", instructions: "Count out five paper loaves and two fish. Pretend to pass the food around the group. Name one thing the disciples found after everyone ate." },
      middle: { title: "Before and after tally", instructions: "Draw a before and after chart using John 6:5–13. Swap charts with a partner and check which numbers come from the text and what each one describes." },
      teen: { title: "Track who does what", instructions: "Read John 6:5–13 and make a quick tally of what Philip, Andrew, Jesus, and the disciples do. Compare the different ways they respond to the shortage." },
    },
  },
  resurrection: {
    craft: {
      title: "Make a sliding stone scene",
      minutes: 20,
      supplies: ["Card or thick paper", "Gray paper", "Scissors", "Tape", "Markers"],
      steps: {
        young: ["Draw the tomb at dawn on a card.", "Ask an adult to cut out a round stone and help you tape it to a strip of paper.", "Slide the stone aside to show the opening. Tell what the women found."],
        middle: ["Draw the tomb, then make a round paper stone on a pull strip.", "Tape two paper loops beside the entrance to guide the strip.", "Write one detail the women see and one thing they hear in Matthew 28:1–10."],
        teen: ["Build a sliding stone scene from card and a paper strip.", "On the revealed space, record what the women see in Matthew 28:1–10. Alongside it, record what they are told to do.", "Use the moving panel to show how discovery leads to action."],
      },
      artTile: 10,
      artAlt: "A cut-paper tomb at dawn with a gray stone on a sliding tab.",
    },
    play: {
      young: { title: "Dawn at the tomb", instructions: "Invite someone to play a reader while you act out walking at dawn, seeing the open tomb, and running to share the news." },
      middle: { title: "Put the morning in order", instructions: "Turn four events from Matthew 28:1–10 into short cards. Shuffle and reorder them together. Check your sequence against the passage." },
      teen: { title: "Trace the message", instructions: "Read Matthew 28:1–10 together. Underline who speaks and who is sent to tell others. Compare how verses 7 and 10 describe the next step." },
    },
  },
  david: {
    craft: {
      title: "Fold a shepherd’s stone pouch",
      minutes: 15,
      supplies: ["Paper", "Tape", "Scissors", "Markers"],
      steps: {
        young: ["Fold paper into a pocket and tape the two sides.", "Cut five large paper stones with an adult’s help and color them.", "Count the stones into the pouch as you tell what David gathered beside the stream."],
        middle: ["Fold and tape a paper pocket.", "Make five paper stones. On each one, write a detail David notices, remembers, or chooses in 1 Samuel 17:32–40.", "Pull one out at a time and explain where it fits in the story."],
      },
      artTile: 11,
      artAlt: "A folded paper pouch holding five colorful paper stones.",
    },
    play: {
      young: { title: "Find five paper stones", instructions: "Ask a partner to hide five large paper stones. Find and count them. Take turns remembering what David brought with him." },
      middle: { title: "Pack for the hillside", instructions: "Write a list of what Saul offers David and what David actually takes. In pairs, explain each difference using a detail from 1 Samuel 17:38–40." },
    },
  },
  jonah: {
    craft: {
      title: "Make a pop-up fish card",
      minutes: 20,
      supplies: ["Blue card or paper", "Colored paper", "Scissors", "Glue stick", "Markers"],
      steps: {
        young: ["Fold a blue card and color waves inside.", "Ask an adult to glue a paper fish to a small folded tab inside the card.", "Draw Jonah beside the fish and open the card to retell how he got another chance."],
        middle: ["Fold a blue card and attach a paper fish to a folded pop-up tab.", "Draw Jonah near the fish and add pictures of the ship and Nineveh on either side.", "Write one action beside each picture and check the order against Jonah 1–3."],
      },
      artTile: 12,
      artAlt: "An open blue card with a friendly pop-up fish and a paper Jonah.",
    },
    play: {
      young: { title: "Which way did Jonah go?", instructions: "Mark a pretend boat and a pretend city on opposite sides of the room. Listen while someone retells the story. Walk to the place Jonah goes each time." },
      middle: { title: "Track the turnarounds", instructions: "Make four cards for Jonah’s first choice, his prayer, his second trip, and his reaction to Nineveh. For each one, decide who changes direction or changes their mind." },
    },
  },
  esther: {
    craft: {
      title: "Make Esther’s speaking-up scroll",
      minutes: 20,
      supplies: ["Paper", "Tape", "Scissors", "Markers", "Colored scraps"],
      steps: {
        middle: ["Roll both ends of a paper strip toward the center. Tape the rolls so the middle stays flat.", "Add a paper crown and three boxes for the plan, the banquet, and Esther’s request.", "Fill each box with a sketch and a short caption based on Esther 4–7."],
        teen: ["Make a paper scroll with rolled ends and divide the center into three blocks.", "Use the blocks to record the risks Esther weighs, the preparation she asks of others, and what she says in Esther 7:3–4.", "Add verse references and point out how the preparation changes her approach."],
      },
      artTile: 13,
      artAlt: "A paper scroll with rolled ends, a golden crown, and three colored spaces.",
    },
    play: {
      middle: { title: "Plan, prepare, speak", instructions: "Sort events in Esther 4–7 into planning, preparing, and speaking. Talk through why Esther does each one before making her request." },
      teen: { title: "Whose risk is visible?", instructions: "Compare Esther 4:11–16 with 7:3–6. In pairs, identify what Esther risks in each scene and what she chooses to reveal to the king." },
    },
  },
  daniel: {
    craft: {
      title: "Build a paper lions’ den",
      minutes: 20,
      supplies: ["Brown and blue card or paper", "Scissors", "Tape", "Markers"],
      steps: {
        middle: ["Fold brown card into an arch and tape it onto a blue base.", "Draw two lions on paper, cut them out, and fold a tab under each so they stand.", "Add a small figure of Daniel and tell what happens the next morning."],
        teen: ["Build a folded paper cave and add simple paper figures of Daniel and the lions.", "Put one scene label outside for the king’s night and another inside for Daniel’s night.", "Use Daniel 6:18–23 to annotate what each person knows as morning arrives."],
      },
      artTile: 14,
      artAlt: "Two folded-paper lions standing inside a paper cave.",
    },
    play: {
      middle: { title: "Before the den, after the den", instructions: "Have one person name a detail from Daniel 6. A partner sorts it as before or after Daniel enters the den and explains how they know." },
      teen: { title: "What can the king change?", instructions: "Assign one group the king’s decisions in Daniel 6:12–18 and the other Daniel’s actions. Compare which choices each person can still make once the decree is in place." },
    },
  },
  "red-sea": {
    craft: {
      title: "Make a paper sea that opens",
      minutes: 15,
      supplies: ["Blue paper", "Card", "Markers", "Glue stick", "Scissors"],
      steps: {
        young: ["Draw a dry path and a line of people down the middle of a card.", "Fold two pieces of blue paper and glue one edge of each piece beside the path so they open like doors.", "Open the waves and walk your fingers across as you retell the story."],
        middle: ["Make two hinged blue waves over a paper path.", "Draw the camps on the outside and people and footprints on the inside.", "Label the cloud, wind, and crossing with details from Exodus 14:19–22."],
        teen: ["Fold two paper gates over a central path. Use the outside for the people’s fear and the inside for the crossing.", "Annotate the outside with Exodus 14:10–15 and the inside with 14:19–22 and 14:30–31.", "Use the opening gates to explain how the passage moves from fear to trust."],
      },
      artTile: 15,
      artAlt: "Two blue paper waves open like gates to show people on a dry path.",
    },
    play: {
      young: { title: "Follow the dry path", instructions: "Make two rows of pillows as pretend waves. Take turns walking between them while someone retells what happened. Pause and name how the people felt when they reached the other side." },
      middle: { title: "Put the crossing in order", instructions: "Write cards for the people seeing the army, the cloud moving, the wind blowing, and the crossing. Shuffle them, then put them in order and check Exodus 14:10–22." },
      teen: { title: "Step forward or stand still?", instructions: "Compare Exodus 14:13–15 in pairs. One person paraphrases Moses’s reassurance and the other paraphrases God’s instruction. Discuss how the crossing puts both words into practice." },
    },
  },
  "samuel-hears-god": {
    craft: {
      title: "Make Samuel’s paper lamp",
      minutes: 15,
      supplies: ["Dark blue paper", "Brown paper", "Yellow tissue paper", "Glue stick", "Markers", "Scissors"],
      steps: {
        young: ["Glue a brown paper lamp shape onto the blue paper.", "Tear yellow tissue paper into a little flame and glue it above the lamp.", "Draw Samuel nearby. Ask someone to tell how Eli helped him listen."],
        middle: ["Cut and glue a paper lamp onto a dark page. Use yellow tissue for the light.", "Draw three speech circles around the lamp to show Samuel’s visits to Eli.", "Write what changes after the third visit and compare it with 1 Samuel 3:8–10."],
        teen: ["Make a paper lamp and draw two columns beside it labeled Night and Morning.", "Under Night, record the change in Eli’s understanding. Under Morning, record Samuel’s hesitation and Eli’s response.", "Add verse references from 1 Samuel 3:8–18 and point out where each person helps the other listen."],
      },
      artTile: 16,
      artAlt: "A paper lamp with a bright yellow tissue-paper flame on a starry blue card.",
    },
    play: {
      young: { title: "Listen for your name", instructions: "Have a partner tell the story. When the partner calls ‘Samuel,’ play Samuel and answer that you are listening. Trade roles and see what changes the third time he goes to Eli." },
      middle: { title: "What changed on the third visit?", instructions: "Read the calls in 1 Samuel 3:4–10. Take turns playing Samuel, Eli, and a narrator. Pause when Eli understands and explain what clue changed his mind." },
      teen: { title: "Trace how a hard message gets heard", instructions: "Read 1 Samuel 3:8–18. Draw two arrows from Eli to Samuel and from Samuel to Eli. Record the words or actions that make each exchange possible." },
    },
  },
  zacchaeus: {
    craft: {
      title: "Build a sliding sycamore card",
      minutes: 20,
      supplies: ["Card or thick paper", "Green and brown paper", "Markers", "Tape", "Scissors"],
      steps: {
        young: ["Draw a tree and a road on a card.", "Ask an adult to cut out a paper Zacchaeus and tape him to a long strip. Tape two loose paper loops to the tree trunk so the strip can slide through.", "Slide him up to see Jesus, then down to welcome him."],
        middle: ["Make a sliding paper figure and two loops that guide it along a sycamore trunk.", "Label the top with why Zacchaeus climbed, and the bottom with what he promised to do.", "Use Luke 19:3–8 to explain what happens between the two positions."],
        teen: ["Build a sliding sycamore card with tree, doorway, and table scenes.", "Add a verse from Luke 19 to each scene and one sentence about what each group of people sees.", "Use the moving figure to trace when welcome turns into a public commitment to repair harm."],
      },
      artTile: 17,
      artAlt: "A paper tree card with a figure of Zacchaeus on a sliding tab.",
    },
    play: {
      young: { title: "Find a spot to see", instructions: "Make a pretend crowd with stuffed animals on the floor. Move a paper Zacchaeus where he can see Jesus without standing on furniture. Take turns telling what Jesus said when he saw him." },
      middle: { title: "Share or repay?", instructions: "Read Luke 19:8 aloud and sort Zacchaeus’s two promises onto Share and Repay cards. Make up a simple example of each that could happen at school or home." },
      teen: { title: "Read the scene in three voices", instructions: "Assign the crowd, Zacchaeus, and Jesus to three readers. After Luke 19:1–10, each voice explains what it sees or values. Compare where the perspectives agree or diverge." },
    },
  },
  "lost-sheep": {
    craft: {
      title: "Make a lost sheep trail map",
      minutes: 15,
      supplies: ["Green and white paper", "Markers", "Scissors", "Tape", "Paper clip"],
      steps: {
        young: ["Fold green paper into a little map. Draw a path, three hills, and a home.", "Ask an adult to cut out a paper sheep and clip it to the map.", "Move the sheep along the path and celebrate with the shepherd when it gets home."],
        middle: ["Draw a trail from the flock to the lost sheep and back home.", "Make a moveable sheep from paper and a clip.", "Place one action from Luke 15:4–6 at each stop and tell what changes as the sheep travels back."],
        teen: ["Fold a map into three panels labeled Complaint, Search, and Celebration.", "Draw or write a detail from Luke 15:1–7 in each panel. Move a clipped sheep through the center panel as you retell the story.", "Compare the audience’s first reaction with the shepherd’s invitation at the end."],
      },
      artTile: 18,
      artAlt: "A white paper sheep clipped to a green trail map with hills.",
    },
    play: {
      young: { title: "Find and celebrate", instructions: "Take turns hiding a paper sheep somewhere easy to reach. Look until you find it and call everyone to celebrate. Retell what the shepherd did next." },
      middle: { title: "Follow the shepherd’s actions", instructions: "Write Search, Carry, and Celebrate on three slips. Shuffle them, put them in order, and explain how each action helps answer the complaint in Luke 15:2." },
      teen: { title: "Compare the two responses", instructions: "Read Luke 15:1–7 and have two voices read the complaint and the invitation to celebrate. Discuss what the change in tone asks of the original audience." },
    },
  },
  "wise-builders": {
    craft: {
      title: "Build two paper houses",
      minutes: 20,
      supplies: ["Card or thick paper", "Gray, tan, and blue paper", "Tape", "Markers", "Scissors"],
      steps: {
        young: ["Fold two little paper houses. Put one on gray paper for rock and one on tan paper for sand.", "Add a strip of blue paper waves. Ask someone to help you hold the rock house upright and tip the sand house down as you retell the story.", "Name one thing Jesus taught that you could do this week."],
        middle: ["Fold two matching houses and make a base for rock and a base for sand.", "Move the same blue paper storm past both houses. Tip one house as the story describes.", "Write the words Hear and Do on the rock side, then explain how Jesus uses the two houses."],
        teen: ["Build two matching paper houses and set them on different paper foundations.", "Label what stays the same in Matthew 7:24–27 and what changes.", "Under the rock house, write an example of putting a teaching from the Sermon on the Mount into practice."],
      },
      artTile: 19,
      artAlt: "Two folded paper houses, one on a gray rock and one on tan sand beside waves.",
    },
    play: {
      young: { title: "Hear it and do it", instructions: "Partner up. One person gives a simple kind direction, like moving a cushion to make room. The other listens and does it. Trade roles, then recall what Jesus said about the wise builder." },
      middle: { title: "Same storm, different ending", instructions: "Make a two-column chart for rock and sand. Ask someone to read Matthew 7:24–27 while you mark every detail that repeats. Circle the detail that changes the ending." },
      teen: { title: "Make a plan to practice", instructions: "Pick one action Jesus teaches in Matthew 5–7. Write one situation where you could put it into practice and a concrete action you could take. Share it with a partner if you like." },
    },
  },
  "adam-and-eve": {
    craft: {
      title: "Make a lift-the-leaf garden",
      minutes: 15,
      supplies: ["Green paper", "Card", "Markers", "Tape", "Scissors"],
      steps: {
        young: ["Draw a garden full of plants on a piece of card.", "Ask an adult to cut three paper leaves and tape one edge of each over your picture so they can lift.", "Under one leaf, draw how to care for a plant. Under another, draw someone you can talk to when you need help."],
        middle: ["Make three lifting leaf flaps on a garden card.", "Under the leaves, draw or write the work God gave, the boundary God set, and the question God asked.", "Add references from Genesis 2–3 and show a partner where each leaf fits."],
        teen: ["Make three hinged leaves for Genesis 2:15–17, 3:8–13, and 3:20–24.", "On each leaf, put a word for the action you notice. Under it, write the verse and a question it raises.", "Use the three leaves to explain how the story moves from care to hiding to life outside Eden."],
      },
      artTile: 20,
      artAlt: "Green paper leaves lifting from a handmade garden card.",
    },
    play: {
      young: { title: "Spot a way to care", instructions: "Have a partner name something in a garden. Take turns saying what it needs and acting out one way to care for it." },
      middle: { title: "What was actually said?", instructions: "Read Genesis 2:16–17 and 3:1–3. Have a partner paraphrase each passage. Compare which details each speaker emphasizes, adds, or leaves out." },
      teen: { title: "Follow the questions", instructions: "Find God’s questions in Genesis 3:9–13. Read them with a partner and compare what each answer reveals about fear, trust, or blame." },
    },
  },
  "tower-of-babel": {
    craft: {
      title: "Build a paper-brick tower",
      minutes: 20,
      supplies: ["Orange or brown paper", "Blue card", "Markers", "Glue stick", "Scissors"],
      steps: {
        young: ["Cut out paper bricks with an adult and stack them into the shape of a tall tower on a card.", "Glue the bricks down and draw two speech bubbles beside the tower.", "Put a different picture in each speech bubble. Take turns explaining the pictures without words."],
        middle: ["Build a stepped tower out of paper rectangles on a card.", "Add two speech bubbles for what the builders said they wanted in Genesis 11:4.", "Draw paths away from the tower and label them with what actually happened in Genesis 11:8–9."],
        teen: ["Make a paper tower with two paths running outward from the base.", "Add the key words about a name and scattering from Genesis 11:4 and 11:8–9.", "On the back, add Genesis 12:2–3 and explain how the promised name serves a different purpose."],
      },
      artTile: 21,
      artAlt: "A stepped terracotta tower made of paper bricks, with colorful speech bubbles beside it.",
    },
    play: {
      young: { title: "Build without words", instructions: "Take turns pointing, drawing, or gesturing to show where a partner can place one paper brick. Talk about which signals helped you understand each other." },
      middle: { title: "What were they building for?", instructions: "Read Genesis 11:1–9. Make a two-column chart for the builders’ plans and the ending. Match each plan with the part of the ending that changes it." },
      teen: { title: "Compare two names", instructions: "Pair up. One reader traces the desire for a name in Genesis 11 and the other traces the promise of a name in Genesis 12. Compare who initiates each and who benefits." },
    },
  },
  "god-calls-abraham": {
    craft: {
      title: "Fold Abram’s journey map",
      minutes: 15,
      supplies: ["Paper", "Colored scraps", "Markers", "Glue stick", "Scissors"],
      steps: {
        young: ["Fold a piece of paper into three parts and draw a home, a path, and a tent.", "Glue little hills or trees beside the path and mark which way the family traveled.", "Unfold the map and retell who traveled with Abram."],
        middle: ["Fold a map for Haran, Shechem, and the camp between Bethel and Ai.", "Mark each stop with an image from Genesis 12:4–9.", "Draw an arrow from the journey to other families to show who is included in the promise."],
        teen: ["Fold a map for the departure, the arrival at Shechem, and the second campsite.", "Add a reference and a line about travel or worship at each stop.", "Use the reverse side to compare what Abram leaves behind with who is included in the promise."],
      },
      artTile: 22,
      artAlt: "A colorful folded map with a dotted route through hills toward a paper tent.",
    },
    play: {
      young: { title: "Pack for the journey", instructions: "Name one thing you would carry on a long walk. Have a partner repeat your item and add another. Then name the people who went with Abram." },
      middle: { title: "Place the journey stops", instructions: "Read Genesis 12:4–9. Make cards for Haran, Shechem, and the camp between Bethel and Ai. Put them in order and explain one event at each stop." },
      teen: { title: "Leave, go, bless", instructions: "Read Genesis 12:1–3. Have each person trace one action. Compare who acts in each phrase and how those actions reach beyond Abram." },
    },
  },
  "sarah-laughs": {
    craft: {
      title: "Make a celebration tent card",
      minutes: 20,
      supplies: ["Purple and orange paper", "Card", "Markers", "Tape", "Scissors"],
      steps: {
        young: ["Draw a tent on a card and tape a paper flap over its doorway.", "Draw Sarah and baby Isaac behind the flap.", "Open the flap to tell why Sarah laughed when Isaac was born."],
        middle: ["Make a tent-shaped flap on a folded card.", "Draw Sarah hearing the promise on the outside and Sarah holding Isaac on the inside.", "Label both pictures using Genesis 18:12 and 21:6. Explain how the meaning of the laughter changes."],
        teen: ["Make a tent card with a flap and add three small paper stars around it.", "On the stars, record who laughs in Genesis 17:17, 18:12, and 21:6 and what each person has just heard or seen.", "Use the inside of the tent to show how the last scene changes the tone of the earlier ones."],
      },
      artTile: 23,
      artAlt: "A purple paper card with stars and an orange tent flap opening to reveal a baby.",
    },
    play: {
      young: { title: "Two kinds of laughter", instructions: "Show with your face how Sarah might look when the promise surprises her and when she shares her joy. Ask a partner to guess the two moments." },
      middle: { title: "Match the laugh to the scene", instructions: "Make two cards labeled Promise and Birth. Take turns reading Genesis 18:9–15 and 21:1–7, then match details about Sarah’s laughter to the right card." },
      teen: { title: "Trace a repeated action", instructions: "Read Genesis 17:17, 18:12, and 21:6 aloud. Write one word for the tone of each laugh and explain what in the passage leads you to it." },
    },
  },
  "jacob-and-esau": {
    craft: {
      title: "Build a peace-bridge card",
      minutes: 20,
      supplies: ["Colored card", "Paper scraps", "Markers", "Tape", "Scissors"],
      steps: {
        young: ["Fold a card and draw a path from each side to the middle.", "Cut out two paper figures or hands with an adult and tape them near the middle so they can reach toward each other.", "Open the card and tell what Esau did when he saw Jacob."],
        middle: ["Make a folded card with two paths meeting at a paper bridge.", "On one side, show Jacob preparing to meet Esau. On the other, show Esau running to him.", "At the bridge, add a detail from Genesis 33:4 or 33:10 and explain why it matters."],
        teen: ["Create a paper bridge with three panels for fear, welcome, and acceptance.", "Cite Genesis 32:7–12 and 33:4–11 as you add a decision or gesture to each panel.", "Draw two paths continuing separately from the bridge and use them to discuss the ending in Genesis 33:16–17."],
      },
      artTile: 24,
      artAlt: "Two paper figures reach toward each other over a small bridge on an open card.",
    },
    play: {
      young: { title: "Finish the meeting", instructions: "Have a partner tell the story up to when Jacob sees Esau. Act out how you think the meeting will go, then listen to what Esau really does." },
      middle: { title: "Expected and actual", instructions: "Write two short scenes, one for what Jacob seems to expect in Genesis 32 and one for what Esau does in Genesis 33:1–11. Compare the actions in each." },
      teen: { title: "Trace the gift", instructions: "Follow the gift from Jacob’s plan in Genesis 32:13–21 to Esau’s acceptance in 33:8–11. In pairs, explain how its meaning shifts between those moments." },
    },
  },
  "baby-moses": {
    craft: {
      title: "Weave a paper basket in the reeds",
      minutes: 20,
      supplies: ["Brown, blue, and green paper", "White paper", "Tape", "Markers", "Scissors"],
      steps: {
        young: ["Make a shallow folded paper basket with an adult. Tape paper strips across its front.", "Fold white paper into a little blanket and put it in the basket. Draw or add paper reeds on a blue river card.", "Set the basket by the reeds and take turns naming the people who helped Moses."],
        middle: ["Make a paper basket by weaving narrow strips through slits in a folded paper base. Tape the strip ends.", "Add paper reeds and a paper blanket.", "Write one action by the mother, sister, and princess on separate reeds, then arrange them in story order."],
        teen: ["Make or draw a basket among paper reeds.", "Add three reeds labeled with actions by the mother, sister, and princess, each with a verse from Exodus 2:1–10.", "Connect these actions with arrows and explain at which moments one person’s decision created room for another person to act."],
      },
      artTile: 25,
      artAlt: "A woven paper basket with a white paper blanket on a blue river card bordered by green reeds.",
    },
    play: {
      young: { title: "Take turns being a helper", instructions: "Use a paper basket to retell the scene. One person plays the mother, one watches as the sister, and one finds the basket as the princess. Switch roles and tell it again." },
      middle: { title: "Make a chain of care", instructions: "Put paper slips for the mother, sister, and princess in story order. Add an action to each slip, then discuss what would be lost from the chain without that action." },
      teen: { title: "The river in two scenes", instructions: "Compare Exodus 1:22 with 2:1–10. Mark how Pharaoh uses the river and how the women use it. Discuss who has power at each turning point." },
    },
  },
  "jesus-is-born": {
    craft: {
      title: "Make a paper manger card",
      minutes: 15,
      supplies: ["Blue card", "Brown and yellow paper", "White paper", "Glue stick", "Scissors", "Markers"],
      steps: {
        young: ["Ask an adult to help cut out a trough and some paper straw.", "Glue them to a card and fold white paper into a little blanket for Jesus.", "Tell someone what the angel said the shepherds should look for."],
        middle: ["Make a pop-up manger from folded brown paper and slip a folded white blanket inside.", "On the left, draw what the shepherds hear. On the right, draw what they find.", "Label both sides using details from Luke 2:8–20."],
        teen: ["Build a small paper manger and place it at the center of a card.", "Add strips for the decree, the angel’s announcement, the shepherds’ report, and Mary’s response.", "Connect each strip to a verse and discuss how the manger works as a sign."],
      },
      artTile: 26,
      artAlt: "A paper manger with straw and a white folded paper swaddle on blue card.",
    },
    play: {
      young: { title: "Find the sign", instructions: "Have someone hide a small drawing of a manger in an easy-to-reach place. Ask for the clue the angel gave and look for the sign together." },
      middle: { title: "Deliver the news", instructions: "Summarize the angel’s message in one sentence. Have a partner play a shepherd and repeat it after finding the manger. Compare what the shepherd can add from experience." },
      teen: { title: "How people respond to the news", instructions: "Read Luke 2:15–20. Track the shepherds, their listeners, and Mary. In pairs, discuss what each reaction contributes to the account." },
    },
  },
  "jesus-baptism": {
    craft: {
      title: "Fold a paper dove over the Jordan",
      minutes: 15,
      supplies: ["White paper", "Blue card or paper", "Tape", "Markers", "Scissors"],
      steps: {
        young: ["Draw blue ripples on a card to show the river.", "Ask an adult to cut a simple bird shape and help you fold its wings upward.", "Tape the dove above the river and tell what happened when Jesus came out of the water."],
        middle: ["Fold a paper dove and attach it above a river scene.", "Add three labels for Jesus rising, the Spirit descending, and the voice speaking.", "Match each label with Matthew 3:16–17."],
        teen: ["Make a folded dove card with space below it for the conversation and above it for the heavenly declaration.", "Add a reference beside each part and underline words that describe Jesus’s identity.", "Explain why Matthew places this scene before the wilderness."],
      },
      artTile: 27,
      artAlt: "A white folded paper dove above blue paper ripples.",
    },
    play: {
      young: { title: "Listen for the key words", instructions: "As someone reads the story, make a wave motion for the river and a wing motion for the dove. Listen quietly for what the voice says." },
      middle: { title: "Name the voices and actions", instructions: "Take turns reading the voices of John, Jesus, and the narrator in Matthew 3:13–17. Then point out what someone sees and what someone hears." },
      teen: { title: "Read what comes before and after", instructions: "Compare Matthew 3:13–17 and 4:1–4. Discuss what each scene says about Jesus as God’s Son." },
    },
  },
  "first-disciples": {
    craft: {
      title: "Make a paper boat and net",
      minutes: 20,
      supplies: ["Brown paper", "Blue card", "White marker or pencil", "Tape", "Scissors"],
      steps: {
        young: ["Fold a brown paper strip into a simple boat and tape it to a blue lake scene.", "Draw a net with white crisscross lines and add the shore.", "Move two paper figures from the lake to the shore as you tell how Jesus called them."],
        middle: ["Make a folded boat scene with an area for casting nets and an area for mending nets.", "Add a paper figure and one line of the story to each side.", "Draw a path away from the boat and mark how each pair responds in Mark 1:16–20."],
        teen: ["Build a paper boat with two flaps for the two pairs of brothers.", "On each flap, map what they are doing, what they leave, and what Jesus asks.", "Use the model to distinguish what repeats from what changes in the two scenes."],
      },
      artTile: 28,
      artAlt: "A folded brown paper fishing boat on a blue card with a net and shoreline.",
    },
    play: {
      young: { title: "Follow by the shore", instructions: "Take turns making a gentle motion like casting a net or taking a step. Have a partner copy it as you retell what the fishermen were doing when Jesus called them." },
      middle: { title: "Match the two pairs", instructions: "Make cards for Simon and Andrew, James and John, casting, and mending. Match them while someone reads Mark 1:16–20 and explain what the two responses have in common." },
      teen: { title: "The invitation and the cost", instructions: "Read both calls in Mark 1:16–20. One person tracks what Jesus offers and the other traces what the disciples leave. Compare the concrete details in each scene." },
    },
  },
  "road-to-emmaus": {
    craft: {
      title: "Make a road-to-table foldout",
      minutes: 20,
      supplies: ["Card or thick paper", "Tan paper", "Tape", "Markers", "Scissors"],
      steps: {
        young: ["Draw the road across a folded card.", "Ask an adult to help make a paper loaf flap at the end of the road.", "Lift the loaf to show the table as you tell when the travelers recognized Jesus."],
        middle: ["Draw the road on two panels and a table on the third. Tape a paper bread flap over the table.", "Put a question about the news on the road, and the moment of recognition under the bread.", "Draw an arrow back toward Jerusalem to show what the travelers did next."],
        teen: ["Create a three-panel card with the road, the table, and the return.", "Annotate each panel with its turning point and a verse from Luke 24:13–35.", "Use the opening bread flap to explain how the account brings understanding and recognition together."],
      },
      artTile: 29,
      artAlt: "A paper loaf flap opens over a folded card with a winding road.",
    },
    play: {
      young: { title: "Walk, welcome, tell", instructions: "Act out walking, inviting someone to sit, and sharing good news. Tell which part of the story each motion belongs to." },
      middle: { title: "Place the clues along the road", instructions: "Write one clue from before the meal and one from after it. Swap clues with a partner and explain what the travelers learn at each point." },
      teen: { title: "Retell from two moments", instructions: "In pairs, summarize what the travelers would say before they recognize Jesus and after they return to Jerusalem. Use Luke 24:19–24 and 32–35 for details." },
    },
  },
  pentecost: {
    craft: {
      title: "Make a Pentecost paper mobile",
      minutes: 20,
      supplies: ["Blue card", "Red, yellow, and orange paper", "Paper strips", "Tape", "Markers", "Scissors"],
      steps: {
        young: ["Cut out colorful paper flame shapes with an adult.", "Tape each shape to a paper strip and tape the strips to a card across the top.", "Draw people below and tell what surprised them when they heard their own languages."],
        middle: ["Make a mobile with paper flame shapes on a card crossbar.", "Add separate speech bubbles for what the crowd heard and what the crowd asked.", "At the bottom, add one way the new community cared for people."],
        teen: ["Make a paper mobile with three tags for the sign, the explanation, and the community’s response.", "Use Acts 2:1–12, 14–21, and 42–47 to put a point and reference on each tag.", "Connect the tags to show how the story moves from an event to a shared way of life."],
      },
      artTile: 30,
      artAlt: "Red, yellow, and orange paper flames hang from a taped paper bar above a blue card.",
    },
    play: {
      young: { title: "Welcome in many ways", instructions: "Take turns using a greeting you already know, a wave, or a picture to welcome a partner. Talk about how it feels when someone helps you understand." },
      middle: { title: "From hearing to helping", instructions: "Sort details from Acts 2 into What they heard and What they did together. Point out which actions helped people feel included or cared for." },
      teen: { title: "Trace who can understand", instructions: "Read Acts 2:5–12 and 42–47. Have one person chart the crowd’s origins and another chart what the believers share. Connect the two scenes in a short discussion." },
    },
  },
  "philip-and-the-traveler": {
    craft: {
      title: "Roll a question-and-answer scroll",
      minutes: 15,
      supplies: ["Paper", "Tape", "Markers", "Paper strip or ribbon"],
      steps: {
        young: ["Draw a chariot and a scroll on a piece of paper.", "Draw the two people talking and ask someone to write the traveler’s question beside them.", "Roll the paper from both ends and tie it with a paper strip or ribbon."],
        middle: ["Roll both ends of a paper strip to make a scroll.", "Draw three scenes in the middle for reading, asking, and stopping by the water.", "Put a short phrase from Acts 8:30–36 beside each scene or draw a symbol to represent it."],
        teen: ["Make a scroll with one side for questions and the other for what changes afterward.", "Cite Acts 8:30–38 and mark who takes the initiative at each point.", "Use the scroll to explain how reading together changes the course of the journey."],
      },
      artTile: 31,
      artAlt: "A rolled paper scroll tied with blue ribbon on a paper path.",
    },
    play: {
      young: { title: "Take turns asking and helping", instructions: "Look at a picture together. Take turns asking one thing about it and helping your partner look for an answer. Retell how Philip helped the traveler with his question." },
      middle: { title: "Who asked the question?", instructions: "Read Acts 8:30–36 with a partner. Write each question on a slip, then assign it to the person who asked it. Discuss what each question makes possible." },
      teen: { title: "Explain a passage together", instructions: "Read Acts 8:30–35 and track the moves from asking to inviting to explaining. In pairs, discuss how a listener can make space for someone to think through a difficult text." },
    },
  },
};
