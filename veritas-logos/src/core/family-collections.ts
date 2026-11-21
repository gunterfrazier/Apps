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
};
