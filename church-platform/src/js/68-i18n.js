// ---------- Spanish for member screens ----------
// The app is written in English. In Spanish, a translator walks every new bit of text on screen and swaps in the
// Spanish for the app's own words: exact phrases first, then patterns for counts, dates and names.
// What a church writes (sermon titles, announcements, prayers) and what people type are left as they are.

const ES = {
  // Tabs, frame and common buttons
  "Home": "Inicio", "Word": "Palabra", "Events": "Eventos", "Connect": "Conectar", "Give": "Dar", "Me": "Mi cuenta", "Main": "Principal", "Sections": "Secciones",
  "Back": "Atrás", "Close": "Cerrar", "Save": "Guardar", "Saved": "Guardado", "Cancel": "Cancelar", "Done": "Listo", "Edit": "Editar", "Remove": "Quitar", "Delete": "Eliminar",
  "Add": "Agregar", "Send": "Enviar", "Open": "Abrir", "Change": "Cambiar", "Continue": "Continuar", "OK": "Aceptar", "Search": "Buscar", "Filter": "Filtrar", "Share": "Compartir",
  "Copy": "Copiar", "Copied": "Copiado", "Clear": "Borrar", "Stop": "Detener", "Listen": "Escuchar", "See all": "Ver todo", "Yes": "Sí", "No": "No", "None": "Ninguno", "Nobody": "Nadie",
  "Notifications": "Notificaciones", "Messages": "Mensajes", "Settings": "Configuración", "Something went wrong": "Algo salió mal", "This screen couldn't load. Your data is safe.": "Esta pantalla no se pudo cargar. Tus datos están a salvo.",
  "Go home": "Ir al inicio", "Select the text and copy it.": "Selecciona el texto y cópialo.", "Copy this": "Copia esto", "Downloads aren't available here": "Las descargas no están disponibles aquí",
  "Nobody matches.": "No hay coincidencias.", "Search people": "Buscar personas", "Search by name": "Buscar por nombre", "Name": "Nombre", "Email": "Correo electrónico", "Phone": "Teléfono",
  "Address": "Dirección", "Time": "Hora", "Date": "Fecha", "Location": "Lugar", "Service": "Servicio", "Notes": "Notas", "Note (optional)": "Nota (opcional)", "Required": "Obligatorio",
  "Choose": "Elegir", "All locations": "Todos los lugares", "Show me": "Mostrarme", "Private": "Privado", "Public": "Público", "New": "Nuevo", "Important": "Importante", "Live": "En vivo",
  "Live now": "En vivo ahora", "Now": "Ahora", "Today": "Hoy", "Sample": "Ejemplo", "Joined": "Miembro", "Looking around": "De visita",

  // Welcome and churches
  "Create your account": "Crea tu cuenta", "Then join your church, or register one.": "Luego únete a tu iglesia o registra una.", "Your name": "Tu nombre",
  "Optional. Churches use it for giving receipts and group updates.": "Opcional. Las iglesias lo usan para recibos de ofrendas y noticias de grupos.", "Create my account": "Crear mi cuenta",
  "This preview keeps everything in this browser. Nothing is sent anywhere, and no real money moves.": "Esta vista previa guarda todo en este navegador. No se envía nada y no se mueve dinero real.",
  "Your churches": "Tus iglesias", "Find your church": "Encuentra tu iglesia", "Find a church": "Buscar una iglesia", "Search by name, city or church ID": "Busca por nombre, ciudad o ID de la iglesia",
  "No church matches that search.": "Ninguna iglesia coincide con esa búsqueda.", "Don't see your church?": "¿No ves tu iglesia?", "Register your church": "Registra tu iglesia", "Register a church": "Registrar una iglesia",
  "This is a sample church so you can try the app.": "Esta es una iglesia de ejemplo para que pruebes la app.", "Look around first": "Ver primero", "Switch church": "Cambiar de iglesia",
  "Enter your name to continue.": "Escribe tu nombre para continuar.", "Your church": "Tu iglesia",

  // Home
  "Latest message": "Último mensaje", "All sermons": "Todos los sermones", "Gather with us": "Reúnete con nosotros", "Watch live": "Ver en vivo", "Coming up": "Próximamente", "All events": "Todos los eventos",
  "Daily reading": "Lectura diaria", "Plans": "Planes", "Start a reading plan": "Empieza un plan de lectura", "Announcements": "Anuncios", "Connect card": "Tarjeta de conexión",
  "New here, have a question, or want to talk with a pastor?": "¿Eres nuevo, tienes una pregunta o quieres hablar con un pastor?", "Invite a friend": "Invita a un amigo",
  "Text, email or share an invitation with service times and directions": "Envía por mensaje, correo o comparte una invitación con horarios y cómo llegar",
  "Your invitation": "Tu invitación", "Change it however you like before you send it.": "Cámbiala como quieras antes de enviarla.", "Text message": "Mensaje de texto",
  "Opens your messaging app with the invitation filled in": "Abre tu app de mensajes con la invitación lista", "Opens your email app, ready to send from your own account": "Abre tu app de correo, lista para enviar desde tu cuenta",
  "More ways to share": "Más formas de compartir", "WhatsApp, Messenger and your other apps": "WhatsApp, Messenger y tus otras apps", "Copy invitation": "Copiar invitación",
  "Paste it anywhere": "Pégala donde quieras", "Invitation copied": "Invitación copiada", "Going": "Asistiré",
  "Service times haven't been added yet.": "Aún no se han agregado los horarios.", "No events on the calendar yet.": "Todavía no hay eventos en el calendario.", "Can you serve?": "¿Puedes servir?",
  "Join to post prayer requests, register for classes, chat with your groups and check in your kids.": "Únete para compartir peticiones de oración, inscribirte en clases, chatear con tus grupos y registrar a tus hijos.",
  "Reason": "Motivo", "I'm new here": "Soy nuevo aquí", "I'd like to talk with a pastor": "Quiero hablar con un pastor", "I want to be baptized": "Quiero bautizarme", "I'd like to serve": "Quiero servir",
  "I have a question": "Tengo una pregunta", "Anything you'd like us to know": "Algo que quieras contarnos", "Email or phone": "Correo o teléfono", "Send card": "Enviar tarjeta",
  "Add an email or phone number so someone can reach you.": "Agrega un correo o teléfono para que alguien pueda contactarte.", "For you": "Para ti", "Clear read": "Borrar leídas",
  "No announcements yet.": "Todavía no hay anuncios.", "Order of service": "Orden del culto", "Upcoming services": "Próximos servicios", "Find us online": "Encuéntranos en línea",
  "Open the livestream": "Abrir la transmisión", "Opens the stream in its own player": "Abre la transmisión en su propio reproductor", "No services scheduled here.": "No hay servicios programados aquí.",
  "Stream services as they happen": "Mira los servicios en vivo", "Service times coming soon": "Horarios próximamente",

  // Word
  "Sermons": "Sermones", "Reading plans": "Planes de lectura", "My notes": "Mis notas", "Look up a passage": "Busca un pasaje", "Opens in Veritas Logos.": "Se abre en Veritas Logos.",
  "Search sermons": "Buscar sermones", "Search titles, passages, speakers and what was said": "Busca títulos, pasajes, predicadores y lo que se dijo", "Filter by book": "Filtrar por libro",
  "Scripture": "Escritura", "Outline": "Bosquejo", "Notes are private to you.": "Tus notas son privadas.", "Write what stood out, questions to ask your group, a verse to memorize...": "Escribe lo que te impactó, preguntas para tu grupo, un versículo para memorizar...",
  "Transcript": "Transcripción", "Search the transcript": "Buscar en la transcripción", "No matches.": "No hay coincidencias.", "Show": "Mostrar", "Hide": "Ocultar",
  "Recording not posted": "Grabación no publicada", "Full sermon outline": "Bosquejo completo del sermón", "Start this plan": "Empezar este plan", "Stop this plan": "Dejar este plan",
  "Browse sermons": "Ver sermones", "Plan started. Today's reading is on Home.": "Plan iniciado. La lectura de hoy está en Inicio.", "Finished": "Terminado", "Saved sermons": "Sermones guardados",
  "Read it in five translations with Hebrew and Greek, cross references and study tools.": "Léelo en cinco traducciones con hebreo y griego, referencias cruzadas y herramientas de estudio.",
  "Ask about it": "Pregunta al respecto", "Sermon notes": "Notas de sermones", "Sermon details copied": "Detalles del sermón copiados", "No sermons have been posted yet.": "Todavía no se han publicado sermones.",

  // Events
  "You're going": "Asistirás", "Directions": "Cómo llegar", "Sign up": "Inscribirme", "Get tickets": "Comprar boletos", "Cancel my spot": "Cancelar mi lugar", "Cancel and refund": "Cancelar y reembolsar",
  "This event is full.": "Este evento está lleno.", "Fill it in": "Llénalo", "Which of your kids are going?": "¿Cuáles de tus hijos irán?", "Email for your receipt": "Correo para tu recibo",
  "Choose your tickets": "Elige tus boletos", "Bringing kids?": "¿Traes niños?", "Registered kids show up in your parent portal.": "Los niños inscritos aparecen en tu portal para padres.",
  "How many people in total, including you?": "¿Cuántas personas en total, contándote a ti?", "Email for a reminder": "Correo para un recordatorio", "Keep my tickets": "Conservar mis boletos",
  "Filter events": "Filtrar eventos", "You're signed up": "Ya estás inscrito", "You're in. See you there!": "¡Listo! Nos vemos allí.", "Add to Google Calendar": "Agregar a Google Calendar",
  "Copy details": "Copiar detalles", "Event details copied": "Detalles del evento copiados", "Your spot is cancelled": "Tu lugar fue cancelado", "Nothing on the calendar yet.": "Todavía no hay nada en el calendario.",
  "All": "Todos", "Community": "Comunidad", "Kids": "Niños", "Youth": "Jóvenes", "Serve": "Servir", "Worship": "Adoración", "Men": "Hombres", "Women": "Mujeres", "Classes": "Clases", "Staff": "Personal",

  // Connect
  "Prayer": "Oración", "Groups": "Grupos", "Directory": "Directorio", "Forms": "Formularios", "Requests": "Peticiones", "Answered": "Contestada", "Mine": "Mías", "Pastors only": "Solo pastores",
  "Share a prayer request": "Comparte una petición de oración", "I prayed": "Oré", "Prayed": "Oré", "Mark answered": "Marcar como contestada", "What can we pray for?": "¿Por qué podemos orar?",
  "Post without my name": "Publicar sin mi nombre", "Only pastors and the prayer team can see this": "Solo los pastores y el equipo de oración pueden verla", "Share request": "Compartir petición",
  "Share how God answered (optional)": "Cuenta cómo respondió Dios (opcional)", "It will no longer show on the prayer wall.": "Ya no aparecerá en el muro de oración.", "Keep it": "Conservarla",
  "Someone at church": "Alguien de la iglesia", "No requests right now.": "No hay peticiones por ahora.", "Answered prayers show up here.": "Las oraciones contestadas aparecen aquí.",
  "You haven't shared a request yet.": "Todavía no has compartido una petición.", "Filter requests": "Filtrar peticiones", "Marked answered": "Marcada como contestada", "Request removed": "Petición eliminada",
  "Yours": "Tuyo", "Requested": "Solicitado", "Full": "Lleno", "Drop in": "Entrada libre", "Topic": "Tema", "What we're studying": "Lo que estamos estudiando", "No registration needed.": "No hace falta inscribirse.",
  "Want it in your parent portal?": "¿Lo quieres en tu portal para padres?", "Add your kids": "Agrega a tus hijos", "Register someone else": "Inscribir a otra persona", "Who's coming?": "¿Quién viene?",
  "Asking to join": "Pidiendo unirse", "Register": "Inscribirme", "Leave": "Salir", "Stay": "Quedarme", "Search the directory": "Buscar en el directorio", "Call or text": "Llamar o enviar mensaje",
  "List me in the directory": "Incluirme en el directorio", "Other members will see your name, phone and email.": "Otros miembros verán tu nombre, teléfono y correo.", "Message": "Mensaje",
  "Sunday school": "Escuela dominical", "Small group": "Grupo pequeño", "Leader": "Líder", "Leaders": "Líderes", "Room": "Salón", "Ages": "Edades",

  // Give
  "Your giving": "Tus ofrendas", "History": "Historial", "Amount in dollars": "Monto en dólares", "Fund": "Fondo", "How often": "Con qué frecuencia", "Pay with": "Pagar con", "Card": "Tarjeta",
  "Bank account": "Cuenta bancaria", "Other ways to give": "Otras formas de dar", "Quick amounts": "Montos rápidos", "See giving history": "Ver historial de ofrendas", "Giving history": "Historial de ofrendas",
  "Recurring gift stopped": "Ofrenda recurrente detenida", "The first gift is today. You can stop it any time from the Give tab.": "La primera ofrenda es hoy. Puedes detenerla cuando quieras desde la pestaña Dar.",
  "One time": "Una vez", "Weekly": "Semanal", "Every two weeks": "Cada dos semanas", "Monthly": "Mensual", "Checkout": "Pago", "Total": "Total", "Year-end statement": "Estado de cuenta anual",
  "Payment was cancelled. Nothing was charged.": "El pago se canceló. No se cobró nada.", "Payment was cancelled. Your answers are still here.": "El pago se canceló. Tus respuestas siguen aquí.",
  "Test payment. No money moves in the preview. On your own website this opens the church's secure checkout with Stripe, PayPal or Square.": "Pago de prueba. En la vista previa no se mueve dinero. En tu propio sitio se abre el pago seguro de la iglesia con Stripe, PayPal o Square.",
  "Test payment. Online payments aren't set up for this church yet, so nothing is charged.": "Pago de prueba. Esta iglesia aún no tiene pagos en línea, así que no se cobra nada.",
  "Or give here": "O da aquí", "Card, Apple Pay or Google Pay": "Tarjeta, Apple Pay o Google Pay", "PayPal or card": "PayPal o tarjeta",
  "Confirming your payment...": "Confirmando tu pago...", "This takes a moment.": "Esto toma un momento.", "Thank you!": "¡Gracias!", "Thank you": "Gracias", "Payment": "Pago",
  "Payment not finished": "Pago sin terminar", "We couldn't check the payment": "No pudimos verificar el pago", "Try again": "Intentar de nuevo",
  "You're in. Your receipt is in your email.": "¡Listo! Tu recibo está en tu correo.", "Your form and payment are in.": "Recibimos tu formulario y tu pago.", "Payment received.": "Pago recibido.",
  "Your payment is processing. Bank payments take a few days to clear, and it shows in your history once it does.": "Tu pago se está procesando. Los pagos bancarios tardan unos días y aparecerán en tu historial cuando se acrediten.",
  "The payment wasn't completed, so nothing was charged. If you did pay, it shows up here in a few minutes.": "El pago no se completó, así que no se cobró nada. Si sí pagaste, aparecerá aquí en unos minutos.",

  // Check-in, household, parents
  "Check in": "Registrar", "Checked in": "Registrado", "Check in kids": "Registrar a los niños", "Parent pickup": "Recogida de padres", "Show this code to pick up": "Muestra este código para recogerlos",
  "Show these at the kids check-in desk. Staff match the code before your kids leave.": "Muéstralos en el registro de niños. El personal verifica el código antes de entregar a tus hijos.",
  "Add your kids once, then check them in from your phone before you get to church.": "Agrega a tus hijos una vez y regístralos desde tu teléfono antes de llegar a la iglesia.",
  "Edit your household": "Editar tu familia", "Serving today?": "¿Sirves hoy?", "Check in for your volunteer team": "Regístrate con tu equipo de voluntarios", "Team": "Equipo", "Your recent serving": "Tu servicio reciente",
  "Your household": "Tu familia", "Household": "Familia", "Parent portal": "Portal para padres", "Who can pick up your kids": "Quién puede recoger a tus hijos",
  "You can always pick up your own kids. Add anyone else, with a photo, so staff can check who they're handing your kids to.": "Siempre puedes recoger a tus hijos. Agrega a otras personas con foto para que el personal sepa a quién entrega a tus hijos.",
  "Kids added here can be registered for classes and events and checked in at any church you belong to. Care notes print on their name tag.": "Los niños que agregues aquí se pueden inscribir en clases y eventos y registrar en cualquier iglesia a la que pertenezcas. Las notas de cuidado se imprimen en su etiqueta.",
  "Add someone": "Agregar a alguien", "Add to your household": "Agregar a tu familia", "Relationship": "Parentesco", "This person is": "Esta persona es", "A child": "Un niño", "An adult": "Un adulto",
  "Birthday": "Cumpleaños", "Month": "Mes", "Day": "Día", "Year": "Año", "Under a year old": "Menos de un año",
  "January": "Enero", "February": "Febrero", "March": "Marzo", "April": "Abril", "May": "Mayo", "June": "Junio", "July": "Julio", "August": "Agosto", "September": "Septiembre", "October": "Octubre", "November": "Noviembre", "December": "Diciembre",
  "Choose a month from the list, or type 1 to 12.": "Elige un mes de la lista o escribe del 1 al 12.", "The day is a number from 1 to 31.": "El día es un número del 1 al 31.",
  "Type the year with four digits, like 2016.": "Escribe el año con cuatro cifras, como 2016.", "Enter the month, day and year.": "Escribe el mes, el día y el año.", "That date hasn't happened yet.": "Esa fecha todavía no llega.", "Used to find the right classes and kids room.": "Sirve para encontrar las clases y el salón de niños adecuados.", "Allergies": "Alergias", "Other care notes": "Otras notas de cuidado",
  "Printed in bold on name tags and shown to teachers.": "Se imprime en negrita en las etiquetas y se muestra a los maestros.", "Child": "Niño", "Adult": "Adulto", "Nobody added yet.": "Todavía no has agregado a nadie.",
  "Nobody else added.": "No has agregado a nadie más.", "Someone who can pick up": "Alguien que puede recogerlos", "Photo": "Foto", "Choose image": "Elegir imagen",
  "You're already checked in": "Ya estás registrado", "Check in to serve": "Regístrate para servir", "Not checked in": "No registrado", "Classes and groups": "Clases y grupos",
  "Show the code at the classroom door to pick up.": "Muestra el código en la puerta del salón para recogerlos.", "Check out": "Recoger", "Picked up": "Recogido",

  // Chat
  "In this preview, messages stay on this device.": "En esta vista previa, los mensajes se quedan en este dispositivo.", "New message": "Mensaje nuevo", "Write a message": "Escribe un mensaje",
  "Chats for your groups and classes appear here automatically. Parents of kids in a class can talk with its teachers.": "Los chats de tus grupos y clases aparecen aquí automáticamente. Los padres pueden hablar con los maestros de la clase de sus hijos.",
  "Leadership": "Liderazgo",

  // Me
  "Your classes and groups": "Tus clases y grupos", "Your events": "Tus eventos", "Links": "Enlaces", "Churches": "Iglesias", "Put the app on your phone": "Pon la app en tu teléfono",
  "Install it like any other app. It opens full screen and works offline.": "Instálala como cualquier app. Se abre en pantalla completa y funciona sin conexión.", "Install app": "Instalar app",
  "Scan a QR code": "Escanear un código QR", "Your profile": "Tu perfil", "Profile saved": "Perfil guardado", "Preview tools": "Herramientas de prueba", "Try a different role": "Probar otro rol",
  "Reset sample data": "Restablecer datos de ejemplo", "Start over with fresh sample churches": "Empezar de nuevo con iglesias de ejemplo", "Admin": "Administración", "Ministry tools": "Herramientas de ministerio",
  "Serving": "Servir", "Your teams, schedule and dates away": "Tus equipos, horario y fechas fuera", "Kids and volunteers": "Niños y voluntarios", "Gifts and year-end statements": "Ofrendas y estados de cuenta anuales",
  "Add your family for classes and check-in": "Agrega a tu familia para clases y registro", "Your kids' classes, events and check-in": "Las clases, eventos y registro de tus hijos",
  "Language, text size, read aloud and notifications": "Idioma, tamaño de letra, lectura en voz alta y notificaciones",

  // Settings
  "Language": "Idioma", "Display": "Pantalla", "Text size": "Tamaño de letra", "Default": "Normal", "Large": "Grande", "Largest": "Muy grande", "More contrast": "Más contraste",
  "Darker text and stronger outlines": "Texto más oscuro y bordes más marcados", "Reduce motion": "Reducir movimiento", "Turn off animations and moving effects": "Desactiva animaciones y efectos de movimiento",
  "Changes the app's buttons, menus and dates. Sermons, announcements and other things your church writes stay as they wrote them.": "Cambia los botones, menús y fechas de la app. Los sermones, anuncios y demás textos de tu iglesia se quedan como los escribieron.",
  "Push notifications": "Notificaciones push", "On for this device": "Activadas en este dispositivo", "Off. Turn on to get them even when the app is closed.": "Desactivadas. Actívalas para recibirlas aunque la app esté cerrada.",
  "Blocked in your browser's settings for this site": "Bloqueadas en la configuración de tu navegador para este sitio", "Work once the app is on your church's website": "Funcionan cuando la app esté en el sitio web de tu iglesia",
  "Turn on": "Activar", "Turn off": "Desactivar", "When your church posts something important": "Cuando tu iglesia publica algo importante", "New messages in your chats": "Mensajes nuevos en tus chats",
  "Requests to serve and reminders the day before": "Solicitudes para servir y recordatorios un día antes", "Events and classes": "Eventos y clases",
  "Reminders the day before something you signed up for": "Recordatorios un día antes de algo en lo que te inscribiste", "Quiet at night": "Silencio de noche", "Hold push notifications from 9 PM to 7 AM": "Pausa las notificaciones de 9 p. m. a 7 a. m.",
  "Push notifications are on": "Notificaciones activadas", "Push notifications are off": "Notificaciones desactivadas", "Read aloud isn't available in this browser": "La lectura en voz alta no está disponible en este navegador",
  "Read aloud": "Lectura en voz alta", "Voice": "Voz", "Speed": "Velocidad", "Slower": "Más lenta", "Normal": "Normal", "Faster": "Más rápida", "Fastest": "La más rápida",
  "Best available": "La mejor disponible", "Most natural": "Las más naturales", "Other voices": "Otras voces", "Voices on this device": "Voces de este dispositivo",
  "Play a sample": "Escuchar una muestra", "Spanish voice": "Voz en español", "English voice": "Voz en inglés", "Reads the Bible and anything written in English": "Lee la Biblia y todo lo que esté escrito en inglés",
  "Read aloud isn't available in this browser.": "La lectura en voz alta no está disponible en este navegador.",
  "Looking for the voices on this device...": "Buscando las voces de este dispositivo...",
  "This device doesn't have a Spanish voice yet. You can add one in your device's settings.": "Este dispositivo todavía no tiene una voz en español. Puedes agregar una en la configuración del dispositivo.",
  "This device doesn't have an English voice yet. You can add one in your device's settings.": "Este dispositivo todavía no tiene una voz en inglés. Puedes agregar una en la configuración del dispositivo.",
  "Get more natural voices": "Consigue voces más naturales", "Voices come from this phone or computer, so the list is different on each one.": "Las voces vienen de este teléfono o computadora, así que la lista es distinta en cada uno.",
  "iPhone and iPad: open Settings, then Accessibility, then Read & Speak (Spoken Content on older versions), then Voices. Download an Enhanced or Premium voice, then choose it here.": "iPhone y iPad: abre Configuración, luego Accesibilidad, luego Leer y hablar (Contenido leído en versiones anteriores) y luego Voces. Descarga una voz Mejorada o Premium y elígela aquí.",
  "Android: install or update Speech Services by Google from the Play Store.": "Android: instala o actualiza Servicios de voz de Google desde Play Store.",
  "Computers: Microsoft Edge has voices marked Natural, and Google Chrome has Google voices.": "Computadoras: Microsoft Edge tiene voces marcadas como Natural y Google Chrome tiene voces de Google.",
  "Tap Listen again to start reading": "Toca Escuchar otra vez para empezar la lectura", "Read aloud stopped. Try another voice in Settings.": "La lectura se detuvo. Prueba otra voz en Configuración.",
  "Bible": "Biblia", "Note": "Nota", "Related": "Relacionados", "Highlights": "Resaltados", "Translation": "Traducción", "Open in Logos": "Abrir en Logos",
  "Copy all notes": "Copiar todas las notas", "All notes copied": "Notas copiadas", "Bible notes": "Notas de la Biblia", "Open the Bible": "Abrir la Biblia",
  "Notes you take on a sermon or a Bible verse, and verses you highlight, show up here.": "Aquí aparecen las notas que tomas en un sermón o en un versículo, y los versículos que resaltas.",
  "Berean Standard Bible. Public domain. Tap a verse to highlight it, write a note, copy, share or see related passages.": "Berean Standard Bible (en inglés). Dominio público. Toca un versículo para resaltarlo, escribir una nota, copiarlo, compartirlo o ver pasajes relacionados.",
  "King James Version. Public domain. Tap a verse to highlight it, write a note, copy, share or see related passages.": "King James Version (en inglés). Dominio público. Toca un versículo para resaltarlo, escribir una nota, copiarlo, compartirlo o ver pasajes relacionados.",
  "(This verse isn't in the earliest manuscripts.)": "(Este versículo no está en los manuscritos más antiguos.)",
  "Highlighted": "Resaltado", "Highlight removed": "Resaltado quitado", "Verses copied": "Versículos copiados", "Note saved": "Nota guardada", "Note deleted": "Nota borrada", "Write your note first.": "Primero escribe tu nota.",
  "Your note": "Tu nota", "Save note": "Guardar nota", "Delete note": "Borrar nota", "Only you can see your notes.": "Solo tú puedes ver tus notas.",
  "What stands out to you? A question, a prayer, something to remember...": "¿Qué te llama la atención? Una pregunta, una oración, algo para recordar...",
  "Clear the selection": "Quitar la selección", "Highlight yellow": "Resaltar en amarillo", "Highlight green": "Resaltar en verde", "Highlight blue": "Resaltar en azul", "Highlight pink": "Resaltar en rosa", "Remove the highlight": "Quitar el resaltado",
  "Related passages": "Pasajes relacionados", "Finding related passages...": "Buscando pasajes relacionados...", "No cross-references for this passage yet.": "Todavía no hay referencias cruzadas para este pasaje.",
  "Related passages couldn't load. Check your connection.": "No se pudieron cargar los pasajes relacionados. Revisa tu conexión.", "Cross-references from": "Referencias cruzadas de",
  "Go to": "Ir a", "A book, or a reference like John 3:16": "Un libro, o una cita como John 3:16", "Old Testament": "Antiguo Testamento", "New Testament": "Nuevo Testamento",
  "Try a book name or a reference like John 3:16": "Prueba con el nombre de un libro o una cita como John 3:16", "Try a reference like John 3:16 or Psalm 23": "Prueba con una cita como John 3:16 o Psalm 23", "Try a reference like John 3:16 or Psalm 23.": "Prueba con una cita como John 3:16 o Psalm 23.",
  "From our church on this passage": "De nuestra iglesia sobre este pasaje", "Also on this passage": "También sobre este pasaje",
  "Berean Standard Bible": "Berean Standard Bible (inglés)", "King James Version": "King James Version (inglés)", "Read buttons and passage look-ups open in": "Los botones Leer y las búsquedas de pasajes se abren en",
  "The Bible here": "La Biblia aquí", "Highlights, notes and related passages. Works offline once a book has been opened.": "Resaltados, notas y pasajes relacionados. Funciona sin conexión cuando ya abriste un libro.",
  "Hebrew and Greek, study tools and study guides": "Hebreo y griego, herramientas y guías de estudio", "Logos Bible": "Logos Bible", "Opens the Logos app, or the Logos website if you don't have the app": "Abre la app de Logos, o el sitio web de Logos si no tienes la app",
  "Show Open in Logos buttons next to passages": "Mostrar botones Abrir en Logos junto a los pasajes", "Opens in the Bible here.": "Se abre en la Biblia aquí.", "Opens in Logos.": "Se abre en Logos.",
  "Someone who schedules the teams approves each request. You'll get a notification when they do.": "Alguien que organiza los equipos aprueba cada solicitud. Recibirás una notificación cuando lo haga.",
  "A note for them (optional)": "Una nota para ellos (opcional)", "Request cancelled": "Solicitud cancelada",
  "Request sent. You'll get a notification when you're approved.": "Solicitud enviada. Recibirás una notificación cuando te aprueben.",
  "Request sent. The leaders will let you know.": "Solicitud enviada. Los líderes te avisarán.",
  "Registered. Approved automatically.": "Inscripción lista. Se aprobó automáticamente.",
  "You can approve requests to join, so you're in as soon as you register.": "Puedes aprobar solicitudes para unirse, así que quedas dentro en cuanto te inscribas.",
  "Nobody else can approve this yet, so it waits in the list until someone can.": "Todavía nadie más puede aprobar esto, así que espera en la lista hasta que alguien pueda.",
  "Teaching here? Scan to present.": "¿Enseñas aquí? Escanea para presentar.",
  "It does this by itself as soon as it can reach the internet. No code needed.": "Lo hace sola en cuanto se conecta a internet. No hace falta ningún código.",
  "There's nothing to read here yet": "Todavía no hay nada que leer aquí", "Listen to the passage": "Escuchar el pasaje", "Listen to the sermon": "Escuchar el sermón",

  // Serving
  "Your schedule": "Tu horario", "Teams": "Equipos", "Dates you're away": "Fechas en que no estarás", "Add dates": "Agregar fechas", "Join": "Unirme", "Accept": "Aceptar", "Decline": "Rechazar",
  "Confirmed": "Confirmado", "Waiting": "En espera", "Can't serve": "No puede servir", "I can't make it": "No puedo", "I can serve after all": "Sí puedo servir",
  "Schedulers see that you're away and won't ask you to serve on these days.": "Los coordinadores verán que no estarás y no te pedirán servir esos días.", "No dates added.": "No hay fechas agregadas.",
  "Can't serve?": "¿No puedes servir?", "A note for the scheduler (optional)": "Una nota para el coordinador (opcional)", "Also mark me away that day": "Marcarme también fuera ese día",
  "Thanks! You're on the schedule": "¡Gracias! Ya estás en el horario", "Thanks for letting us know": "Gracias por avisarnos", "From": "Desde", "To": "Hasta", "Schedule teams": "Programar equipos",

  // Forms
  "Which child?": "¿Para cuál niño?", "Sign here": "Firma aquí", "Type your full name": "Escribe tu nombre completo", "Submit": "Enviar", "This form isn't taking responses right now.": "Este formulario no está recibiendo respuestas ahora.",
  "This form is filled in for each child. Add your kids to your household first.": "Este formulario se llena para cada niño. Primero agrega a tus hijos a tu familia.", "No forms right now.": "No hay formularios por ahora.",
  "Sign here with your finger or mouse": "Firma aquí con tu dedo o el ratón", "You've filled this in": "Ya lo llenaste",

  // Kiosk (families use it)
  "Welcome! Let's check in your kids.": "¡Bienvenidos! Vamos a registrar a sus hijos.", "Phone or last name": "Teléfono o apellido", "Phone number or last name": "Número de teléfono o apellido",
  "Type the last four digits of your phone number, or your last name.": "Escribe los últimos cuatro dígitos de tu teléfono o tu apellido.",
  "We couldn't find you. Try your phone number or last name, or check in as a guest below.": "No te encontramos. Prueba con tu teléfono o apellido, o regístrate como visita abajo.",
  "First time here? Check in as a guest": "¿Primera vez aquí? Regístrate como visita", "Who's here today?": "¿Quién vino hoy?", "Choose who's here": "Elige quién vino", "Already checked in": "Ya registrado",
  "Print tags again for kids already checked in": "Imprimir otra vez las etiquetas de los niños ya registrados", "Welcome! We're glad you're here.": "¡Bienvenidos! Nos alegra que estén aquí.",
  "Tell us a little about your family. It only takes a minute.": "Cuéntanos un poco sobre tu familia. Solo toma un minuto.", "Email (optional)": "Correo (opcional)", "Add another child": "Agregar otro niño",
  "You're checked in!": "¡Ya están registrados!", "Print tags": "Imprimir etiquetas", "Pickup tag": "Etiqueta de recogida", "Show this tag to pick up.": "Muestra esta etiqueta para recogerlos.",
  "QR code": "Código QR", "Watch": "Ver", "Scan": "Escanear", "Ministry": "Ministerio", "Parents": "Padres", "Read": "Leer", "Podcast": "Pódcast", "Classes and Sunday school": "Clases y escuela dominical",
  "Staff updates": "Avisos para el personal", "New people to follow up, room requests and form responses": "Personas nuevas para dar seguimiento, solicitudes de salones y respuestas de formularios",
  "Prayer requests": "Peticiones de oración", "Small groups": "Grupos pequeños", "Kids check-in": "Registro de niños", "Volunteer check-in": "Registro de voluntarios",
  "Number pad": "Teclado numérico", "Exit the kiosk": "Salir del quiosco", "Keep going: 1 more digit.": "Sigue: falta 1 dígito.",
};
const ES_NOUNS = {
  sermon: ["sermón", "sermones"], event: ["evento", "eventos"], person: ["persona", "personas"], people: ["persona", "personas"], child: ["niño", "niños"], children: ["niño", "niños"],
  minute: ["minuto", "minutos"], day: ["día", "días"], week: ["semana", "semanas"], gift: ["ofrenda", "ofrendas"], spot: ["lugar", "lugares"], member: ["miembro", "miembros"], request: ["petición", "peticiones"],
  response: ["respuesta", "respuestas"], church: ["iglesia", "iglesias"], churches: ["iglesia", "iglesias"], segment: ["parte", "partes"], word: ["palabra", "palabras"], "saved item": ["elemento guardado", "elementos guardados"],
  paragraph: ["párrafo", "párrafos"], ticket: ["boleto", "boletos"], time: ["vez", "veces"], unread: ["sin leer", "sin leer"],
};
const ES_DAYS_PL = { Sundays: "domingos", Mondays: "lunes", Tuesdays: "martes", Wednesdays: "miércoles", Thursdays: "jueves", Fridays: "viernes", Saturdays: "sábados" };
const churchNamed = (n) => S.churches().some((c) => c.name === n);
const esPlural = (n, word) => { const w = ES_NOUNS[word.toLowerCase()] || ES_NOUNS[word.toLowerCase().replace(/s$/, "")]; return w ? `${n} ${+n === 1 ? w[0] : w[1]}` : null; };
const ES_PATTERNS = [
  [/^(\d+) ([a-z]+(?: item)?)$/i, (m, n, w) => esPlural(n, w)],
  [/^(\d+) ([a-z]+(?: item)?) joined$/i, (m, n, w) => { const p = esPlural(n, w); return p && `${p} como miembro`; }],
  [/^(\d+) signed up(?:, (\d+) spots left)?$/, (m, n, left) => `${n} inscritos${left != null ? `, quedan ${left} lugares` : ""}`],
  [/^(\d+) minutes$/, (m, n) => `${n} minutos`],
  [/^Join (.+)$/, (m, c) => churchNamed(c) ? `Unirme a ${c}` : null],
  [/^Leave (.+)$/, (m, c) => churchNamed(c) ? `Salir de ${c}` : null],
  [/^Join (.+) to (.+)\.$/, (m, c, what) => churchNamed(c) ? `Únete a ${c} para ${tr(what) === what ? what : tr(what)}.` : null],
  [/^Sent to (.+)$/, (m, c) => churchNamed(c) ? `Enviado a ${c}` : null],
  [/^You joined (.+)$/, (m, c) => `Te uniste a ${c}`],
  [/^You're on the (.+) team\. No approval needed\.$/, (m, t) => `Ya estás en el equipo ${t}. No hace falta aprobación.`],
  [/^Present in (.+)$/, (m, r) => `Presentar en ${r}`],
  [/^Ask to join (.+)$/, (m, t) => `Pedir unirme a ${t}`],
  [/^Notify everyone who can approve this \((\d+) (person|people)\)$/, (m, n) => `Avisar a todos los que pueden aprobarlo (${n} ${n === "1" ? "persona" : "personas"})`],
  [/^You're on the (.+) team$/, (m, t) => `Ya estás en el equipo ${t}`],
  [/^You're in (.+)$/, (m, g) => `Ya estás en ${g}`],
  [/^Your request to join (.+)$/, (m, g) => `Tu solicitud para unirte a ${g}`],
  [/^Opens (.+) in (the Bible here|Veritas Logos|Logos)\.$/, (m, r, w) => `Abre ${r} en ${w === "the Bible here" ? "la Biblia aquí" : w}.`],
  [/^Opening (.+)\.\.\.$/, (m, r) => `Abriendo ${r}...`],
  [/^(.+) couldn't load\. Check your connection and try again\.$/, (m, r) => `No se pudo cargar ${r}. Revisa tu conexión e inténtalo de nuevo.`],
  [/^Note on (.+)$/, (m, r) => `Nota sobre ${r}`],
  [/^Related to (.+)$/, (m, r) => `Relacionado con ${r}`],
  [/^Your note on (.+)$/, (m, r) => `Tu nota sobre ${r}`],
  [/^From our church on (.+)$/, (m, r) => `De nuestra iglesia sobre ${r}`],
  [/^And (\d+) more\.$/, (m, n) => `Y ${n} más.`],
  [/^(Previous|Next) chapter: (.+)$/, (m, w, r) => `Capítulo ${w === "Previous" ? "anterior" : "siguiente"}: ${r}`],
  [/^(.+) is signing back in\.$/, (m, n) => `${n} está volviendo a iniciar sesión.`],
  [/^Goes to the staff at (.+)\.$/, (m, c) => `Llega al personal de ${c}.`],
  [/^Sign up for (.+)$/, (m, e) => `Inscribirme en ${e}`],
  [/^Tickets for (.+)$/, (m, e) => `Boletos para ${e}`],
  [/^Continue to pay (.+)$/, (m, a) => `Continuar y pagar ${a}`],
  [/^Pay (\$[\d,.]+) \(test\)$/, (m, a) => `Pagar ${a} (prueba)`],
  [/^Give with (.+)$/, (m, g) => `Dar con ${g === "Our giving page" ? "nuestra página de ofrendas" : g}`],
  [/^Opens (\S+)\. Gifts made there show in (.+), not in your history here\.$/, (m, h, g) => `Abre ${h}. Las ofrendas hechas allí aparecen en ${g === "that service" ? "ese servicio" : g}, no en tu historial aquí.`],
  [/^You'll finish on (\w+)'s secure page(?: \((.+)\))?\.$/, (m, p, how) => `Terminarás en la página segura de ${p}${how ? ` (${tr(how)})` : ""}.`],
  [/^Your gift to (.+) was received\. Watch your email for a receipt\.$/, (m, c) => `Recibimos tu ofrenda para ${c}. Revisa tu correo para ver el recibo.`],
  [/^Submit and pay (.+)$/, (m, a) => `Enviar y pagar ${a}`],
  [/^Check in (\d+) (child|children)$/, (m, n) => `Registrar ${n} ${+n === 1 ? "niño" : "niños"}`],
  [/^Checked in\. Pickup code (\w+)$/, (m, c) => `Registrados. Código de recogida ${c}`],
  [/^Checked in with (.+)\. Thanks for serving!$/, (m, t) => `Registrado con ${t}. ¡Gracias por servir!`],
  [/^Keep going: (\d) more digits\.$/, (m, n) => `Sigue: faltan ${n} dígitos.`],
  [/^(.+)'s family\. Tap to choose\.$/, (m, n) => `Familia de ${n}. Toca para elegir.`],
  [/^(.+)'s family$/, (m, n) => `Familia de ${n}`],
  [/^Your pickup code is$/, () => "Tu código de recogida es"],
  [/^Fill in for (.+)$/, (m, n) => `Llenar para ${n}`],
  [/^Thanks(?:, (.+) is set)?!$/, (m, n) => n ? `¡Gracias! ${n} está listo.` : "¡Gracias!"],
  [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s\b.*$/, (m) => `Los ${m.replace(/\b(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)days\b/g, (x) => ES_DAYS_PL[x]).replace(/ and /g, " y ").replace(/ at /, " a las ").replace(/ to /, " a ").replace(/, starting /, ", desde el ").replace(/, through /, ", hasta el ")}`],
  // "domingo, 15 de nov at 9:00 a.m." once the date itself is already in Spanish.
  [/^(.+?) at (\d{1,2}:\d{2}.*)$/, (m, a, b) => /\b(dom|lun|mar|mié|jue|vie|sáb|ene|feb|abr|may|jun|jul|ago|sept?|oct|nov|dic)\b|domingo|lunes|martes|miércoles|jueves|viernes|sábado/i.test(a) ? `${a} a las ${b}` : null],
  [/^(\d{1,2}:\d{2}\s?[ap]\.?\s?m\.?) to (.+)$/i, (m, a, b) => `${a} a ${b}`],
  [/^(\d+) plans? from (.+)$/, (m, n, c) => `${n} ${+n === 1 ? "plan" : "planes"} de ${c}`],
  [/^Day (\d+) of (\d+)$/, (m, a, b) => `Día ${a} de ${b}`],
  [/^(\d+) of (\d+) days read\. Started (.+)\.$/, (m, a, b, d) => `${a} de ${b} días leídos. Empezaste el ${d}.`],
  [/^Started at (.+)$/, (m, t) => `Empezó a las ${t}`],
  [/^Today at (.+)$/, (m, t) => `Hoy a las ${t}`],
  [/^Saved (.+)$/, (m, t) => `Guardado ${t}`],
];
function tr(s) {
  if (lang() !== "es" || !s) return s;
  const t = String(s), key = t.trim();
  if (ES[key]) return t.replace(key, ES[key]);
  for (const [re, fn] of ES_PATTERNS) { const m = key.match(re); if (m) { const out = fn(...m); if (out) return t.replace(key, out); } }
  return s;
}
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
function translateTree(root) {
  if (lang() !== "es" || !root) return;
  if (root.nodeType === 3) { const p = root.parentNode; if (p && !SKIP.has(p.nodeName) && !p.closest?.("[translate=no]")) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName) || root.closest?.("[translate=no]")) return;
  for (const a of ["placeholder", "aria-label", "title"]) if (root.hasAttribute?.(a)) { const v = tr(root.getAttribute(a)); if (v !== root.getAttribute(a)) root.setAttribute(a, v); }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && (SKIP.has(n.nodeName) || n.getAttribute("translate") === "no") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let n; while ((n = w.nextNode())) {
    if (n.nodeType === 3) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    else for (const a of ["placeholder", "aria-label", "title"]) if (n.hasAttribute(a)) { const v = tr(n.getAttribute(a)); if (v !== n.getAttribute(a)) n.setAttribute(a, v); }
  }
}
// Everything that lands on screen, including sheets, toasts and live search results, goes through the translator.
new MutationObserver((list) => { if (lang() !== "es") return; for (const m of list) m.addedNodes.forEach(translateTree); })
  .observe(document.documentElement, { childList: true, subtree: true });
