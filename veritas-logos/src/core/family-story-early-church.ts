import type { FamilyStory } from "./family-stories";

export const EARLY_CHURCH_FAMILY_STORIES: FamilyStory[] = [
  {
    id: "jesus-is-born", title: "The Birth of Jesus", testament: "new",
    sceneTitles: ["A journey to Bethlehem", "Good news for shepherds", "Finding Jesus"],
    reference: "Luke 2:1–20", reading: "Luke 2:1–20",
    topic: "Joy, good news, and welcome",
    drawPrompt: "Color the manger and draw a detail that would help the shepherds know they had found the right place.",
    activity: { prompt: "What helped the shepherds know they had found Jesus?", options: ["A crown", "A baby wrapped in cloths and lying in a manger", "A fishing boat"], answer: 1, explanation: "The angel told them to look for a baby wrapped in cloths and lying in a manger." },
    editions: {
      young: {
        paragraphs: [
          "The ruler called for people to be counted. Joseph traveled with Mary to Bethlehem. While they were there, Mary gave birth to Jesus. She wrapped him in cloths and laid him in a manger because there was no room for them in the guest room.",
          "Nearby, shepherds were watching their sheep at night. An angel told them to be unafraid and brought good news of great joy. A Savior had been born. They would find a baby wrapped in cloths and lying in a manger.",
          "The shepherds hurried to Bethlehem. They found Mary, Joseph, and the baby, just as they had been told. They shared the news and went back praising God. Mary kept these things in her heart and thought about them.",
        ], question: "How did the shepherds share their joy after they saw the baby?",
      },
      middle: {
        paragraphs: [
          "Luke begins with a decree for registration. Joseph travels from Nazareth to Bethlehem because he belongs to David’s family. Mary gives birth there, wraps the child, and lays him in a manger because the guest room has no space for them.",
          "The announcement comes to shepherds working outside at night. The angel tells them a Savior, the Christ and Lord, has been born in David’s town. The sign is a wrapped infant in a manger. A multitude praises God and announces peace.",
          "The shepherds go to see what the Lord has made known. They find the sign and tell others what they heard. Their hearers are amazed, Mary ponders what has happened, and the shepherds return praising God.",
        ], question: "Why might the manger be an unexpected sign after the angel’s announcement in Luke 2:10–12?",
      },
      teen: {
        paragraphs: [
          "Luke places the birth within a ruler’s decree reaching across the empire. The registration brings Joseph and Mary to the city of David. The birth itself is described through spare details about wrapping the child, a manger, and a lack of space.",
          "The angel uses expansive language about joy, a Savior, and peace, then gives the shepherds a specific sign. The language of the announcement sits alongside a newborn in a feeding trough. The shepherds travel to see whether what they heard matches what they find.",
          "Luke gives different responses to the same news. The shepherds speak and praise, their hearers are amazed, and Mary keeps and ponders what happened. The story moves from rulers issuing orders to workers carrying news and a mother holding it in memory.",
        ], question: "How does Luke’s movement from the emperor’s decree to the shepherds’ report shape who matters in the story?",
      },
    },
  },
  {
    id: "jesus-baptism", title: "The Baptism of Jesus", testament: "new",
    sceneTitles: ["At the Jordan", "Jesus is baptized", "A voice from heaven"],
    reference: "Matthew 3:13–17", reading: "Matthew 3:13–17", teenReading: "Matthew 3:1–6; Matthew 3:11–17",
    topic: "Belovedness and the beginning of Jesus’ ministry",
    drawPrompt: "Color the ripples in the Jordan River and draw the dove’s path above Jesus.",
    activity: { prompt: "What did the Spirit descend like?", options: ["A cloud", "A dove", "A boat"], answer: 1, explanation: "Matthew describes the Spirit of God coming down like a dove." },
    editions: {
      young: {
        paragraphs: [
          "John was baptizing people in the Jordan River. Jesus came from Galilee and asked John to baptize him. John was surprised and said that he needed to be baptized by Jesus.",
          "Jesus told John to go ahead because it was right for them to do this. John agreed and baptized Jesus in the Jordan.",
          "As Jesus came up from the water, the heavens opened. The Spirit came down like a dove. A voice from heaven said that Jesus was his beloved Son and that he was pleased with him.",
        ], question: "What did the voice from heaven tell us about Jesus?",
      },
      middle: {
        paragraphs: [
          "Jesus travels from Galilee to the Jordan to be baptized. John objects, saying Jesus ought to baptize him. Jesus asks him to allow it for now so they can fulfill all righteousness, and John agrees.",
          "Jesus comes up from the water, and the scene moves from their conversation to the opened heavens. Matthew describes the Spirit of God descending like a dove and coming to rest on Jesus.",
          "A voice from heaven calls Jesus his beloved Son and expresses delight in him. The account appears just before Jesus goes into the wilderness and begins to teach publicly.",
        ], question: "What do John’s words and the heavenly voice each say about who Jesus is?",
      },
      teen: {
        paragraphs: [
          "Matthew has introduced John as a wilderness preacher calling hearers to repentance. John distinguishes his baptism with water from the work of one coming after him. When Jesus asks for baptism, John’s objection puts that difference into words.",
          "Jesus responds with the language of fulfilling righteousness. John consents. Matthew then concentrates the scene around three actions: Jesus rises from the water, the heavens open, and the Spirit descends like a dove.",
          "The voice identifies Jesus as the beloved Son and expresses God’s pleasure in him. The declaration comes before the wilderness and the public work that follows. It gives readers a statement about Jesus’s identity before they watch what he does next.",
        ], question: "Why does it matter that this declaration comes before the testing in the wilderness and Jesus’s public ministry?",
      },
    },
  },
  {
    id: "first-disciples", title: "Jesus Calls the First Disciples", testament: "new",
    sceneTitles: ["Two brothers casting nets", "An invitation to follow", "Two more leave their boat"],
    reference: "Mark 1:14–20", reading: "Mark 1:14–20",
    topic: "Following, learning, and a new purpose",
    drawPrompt: "Color the fishing boat and draw what the brothers left on the shore when they followed Jesus.",
    activity: { prompt: "What were Simon and Andrew doing when Jesus called them?", options: ["Casting a fishing net", "Building a tower", "Carrying bread"], answer: 0, explanation: "Simon and Andrew were casting a net into the Sea of Galilee because they were fishermen." },
    editions: {
      young: {
        paragraphs: [
          "Jesus came to Galilee and told people good news about God’s kingdom. As he walked beside the lake, he saw two brothers, Simon and Andrew. They were throwing a net into the water to catch fish.",
          "Jesus invited them to follow him. He said he would teach them to fish for people. They left their nets and went with him.",
          "A little farther on, Jesus saw James and John fixing their nets in a boat. He called them too. They left the boat with their father and the workers and went after Jesus.",
        ], question: "What did the brothers do when Jesus told them to follow him?",
      },
      middle: {
        paragraphs: [
          "After John is arrested, Jesus comes to Galilee announcing that God’s kingdom has come near. Beside the lake he sees Simon, later called Peter, and Andrew casting nets as part of their work.",
          "Jesus calls them to follow and tells them he will make them fishers of people. The invitation uses the work they already know as a picture of something new. They leave the nets immediately.",
          "Jesus then calls James and John while they mend nets in a boat. They leave their father Zebedee with the hired workers and follow. Mark tells both calls side by side so readers can notice what repeats and what changes.",
        ], question: "How does Jesus use familiar work to describe a new purpose?",
      },
      teen: {
        paragraphs: [
          "Mark places the calls directly after Jesus’s announcement about the nearness of God’s kingdom. Simon and Andrew are working with a net when Jesus makes the invitation. The account gives no long discussion between the call and their response.",
          "The promise to make them fishers of people takes language from their current lives. Their departure leaves behind tools of their trade. The words also describe what Jesus will make of them over time.",
          "The second pair is described through relationships and responsibilities inside a boat. James and John leave Zebedee with hired workers. The two accounts emphasize an immediate response while leaving room for the rest of Mark to show what following Jesus entails.",
        ], question: "What stays connected to the fishermen’s old lives, and what changes when they follow Jesus?",
      },
    },
  },
  {
    id: "road-to-emmaus", title: "The Road to Emmaus", testament: "new",
    sceneTitles: ["An unexpected companion", "Listening on the road", "Recognition at the table"],
    reference: "Luke 24:13–35", reading: "Luke 24:13–35",
    topic: "Hope, hospitality, and recognizing Jesus",
    drawPrompt: "Color the scene at the table and draw what Jesus shared when the travelers recognized him.",
    activity: { prompt: "When did the travelers recognize Jesus?", options: ["When he broke the bread", "When they found a crown", "When they reached the river"], answer: 0, explanation: "They recognized Jesus after he blessed the bread, broke it, and gave it to them." },
    editions: {
      young: {
        paragraphs: [
          "After Jesus died, two of his followers walked to a village called Emmaus. They were sad and talked about what had happened. Jesus came and walked with them, but they did not recognize him.",
          "They told him about their sadness and the news that the tomb was empty. As they walked, he helped them understand what the Scriptures said. When evening came, they invited him to stay.",
          "At the table Jesus blessed the bread, broke it, and gave it to them. Then they recognized him. He disappeared from their sight, and the two went back to Jerusalem to tell the others what had happened.",
        ], question: "How did the travelers welcome the person walking with them?",
      },
      middle: {
        paragraphs: [
          "Two followers leave Jerusalem for Emmaus discussing everything that has happened. Jesus joins them, but they are kept from recognizing him. Cleopas and his companion explain their dashed hopes and the report that the tomb is empty.",
          "Jesus interprets what Moses and the prophets say about the Messiah. When they reach the village, the followers urge him to stay because it is evening. Their invitation shifts the story from the road to a shared meal.",
          "Jesus takes, blesses, breaks, and gives the bread. They recognize him, and he vanishes. They remember how their hearts felt while he explained the Scriptures. They return to Jerusalem and report how they recognized him in breaking the bread.",
        ], question: "What did they understand on the road, and what did they recognize at the table?",
      },
      teen: {
        paragraphs: [
          "The travelers are carrying both disappointment and the report of an empty tomb. Their words about what they had hoped reveal the story they expected Jesus’s life to follow. The one they are discussing hears it without being recognized.",
          "Jesus reopens the question through the Scriptures. The travelers later describe the effect of that conversation before they had a name for their companion. At the village they take the initiative to welcome him in for the evening.",
          "Recognition comes through an action at the table. It changes the direction of the journey, taking them back to the community in Jerusalem. Luke closes with both the interpretation on the road and recognition in the breaking of bread.",
        ], question: "How do the road, the table, and the return to Jerusalem each contribute something different to the story?",
      },
    },
  },
  {
    id: "pentecost", title: "Pentecost", testament: "new",
    sceneTitles: ["Together in one place", "Hearing in many languages", "A community begins"],
    reference: "Acts 2", reading: "Acts 2:1–12; Acts 2:37–42",
    teenReading: "Acts 2:1–21; Acts 2:37–47",
    topic: "The Holy Spirit, understanding, and community",
    drawPrompt: "Color the flame shapes above the group and draw a speech bubble for someone hearing the message.",
    activity: { prompt: "What surprised the crowd at Pentecost?", options: ["People heard in their own languages", "The city had a new tower", "Everyone received a basket of fish"], answer: 0, explanation: "People from many places heard the disciples speaking in their own languages." },
    editions: {
      young: {
        paragraphs: [
          "Jesus’s followers were together when a sound like a strong wind filled the house. They saw shapes like tongues of fire resting on each person. The Holy Spirit filled them, and they began to speak in other languages.",
          "People from many places were in Jerusalem. They heard the followers speaking about what God had done. Each heard the message in their own language. They were amazed and wondered what it meant.",
          "Peter stood up and told them about Jesus. Many people believed and were baptized. They learned together, shared meals, and prayed. The group grew as more people joined them.",
        ], question: "How would you feel if you heard good news in a language you understood while you were far from home?",
      },
      middle: {
        paragraphs: [
          "On the day of Pentecost, the believers are gathered together. A sound like a rushing wind fills the house. Something like tongues of fire appears and rests on them. The Spirit enables them to speak in different languages.",
          "Visitors and residents from many regions hear the group talking about God’s deeds in their own languages. Some are amazed and ask what it means. Others mock the group. Peter stands with the apostles and explains the event using the prophet Joel.",
          "Peter’s message about Jesus leads people to ask what they should do. Many respond and are baptized. Acts describes the growing community through teaching, fellowship, meals, prayers, and sharing with people in need.",
        ], question: "How does the community’s life at the end of Acts 2 show the effect of what the crowd heard?",
      },
      teen: {
        paragraphs: [
          "Acts describes the Spirit’s coming by comparing the sound to wind and the visible signs to fire. The narrative quickly shifts from the room to a crowd whose origins the writer lists. Each hears in a familiar language.",
          "The crowd gives different explanations, and Peter responds with Joel’s promise of the Spirit. His speech connects the event with Jesus’s death and resurrection and leads the hearers to ask how they should respond.",
          "The end of Acts 2 describes an ongoing pattern of teaching, shared meals, prayer, and care for material needs. The public act of being heard leads into a portrait of people learning to live together.",
        ], question: "What does Acts gain by listing where the hearers came from before showing what the new community does together?",
      },
    },
  },
  {
    id: "philip-and-the-traveler", title: "Philip and the Ethiopian Traveler", testament: "new",
    sceneTitles: ["A meeting on the road", "A question about the scroll", "Water by the road"],
    reference: "Acts 8:26–40", reading: "Acts 8:26–40",
    topic: "Questions, guidance, and belonging",
    drawPrompt: "Color the road and the chariot. Add a speech bubble for the traveler’s question.",
    activity: { prompt: "Whose words was the traveler reading?", options: ["Isaiah’s", "Peter’s", "Jonah’s"], answer: 0, explanation: "Philip heard the traveler reading from the prophet Isaiah." },
    editions: {
      young: {
        paragraphs: [
          "An angel told Philip to go to a road from Jerusalem to Gaza. A traveler from Ethiopia was riding along the road in a chariot. He was reading a scroll from the prophet Isaiah.",
          "The Spirit told Philip to go near the chariot. Philip heard the traveler reading and asked if he understood. The traveler asked for help and invited Philip to sit beside him. Philip began with the scroll and told him the good news about Jesus.",
          "As they traveled, they came to water. The traveler asked to be baptized. He stopped the chariot, and Philip baptized him. The traveler continued on his way with joy.",
        ], question: "What helped the traveler ask his question and find an answer?",
      },
      middle: {
        paragraphs: [
          "Philip is directed to the road going south from Jerusalem to Gaza. There he meets an Ethiopian official in charge of the queen’s treasury. The man is returning from worship in Jerusalem and reading Isaiah in his chariot.",
          "Philip runs alongside, hears the reading, and asks whether the traveler understands it. The traveler invites Philip to sit with him and asks whom the prophet is describing. Philip starts from that passage and tells him the good news about Jesus.",
          "When they reach water, the traveler asks what could prevent him from being baptized. The chariot stops and Philip baptizes him. Acts ends the encounter with the traveler rejoicing and Philip continuing to share the message elsewhere.",
        ], question: "What does the traveler do to make this conversation possible?",
      },
      teen: {
        paragraphs: [
          "Acts places the meeting on a road away from the city. The traveler is named by origin and by his position in the queen’s court, and the account describes him as a eunuch. He is already reading Isaiah aloud when Philip approaches.",
          "Philip opens with a question about understanding. The traveler answers with a question of his own, offers Philip a seat, and points to a particular difficulty in the text. Their exchange moves from Isaiah’s words to the good news about Jesus.",
          "The traveler notices water and asks what would prevent baptism. Both go down to it, and afterward their routes separate. The traveler goes on rejoicing. The encounter gives him an active role in asking, inviting, and responding.",
        ], question: "How do the questions, the invitation, and the traveler’s request for baptism shape who takes the initiative?",
      },
    },
  },
];
