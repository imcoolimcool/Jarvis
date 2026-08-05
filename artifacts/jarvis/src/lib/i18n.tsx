import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "nl";

/* ────────────────────────────────────────────────────────────────────────────
 * English dictionary
 * ────────────────────────────────────────────────────────────────────────── */
const en = {
  /* Header */
  "header.title": "Jarvis",
  "header.search": "Search",
  "header.settings": "Settings",
  "header.mode.voice": "Voice",
  "header.mode.chat": "Chat",
  "header.mode.agent": "Agent",
  "header.mode.camera": "Camera",
  "header.lightMode": "Light mode",
  "header.darkMode": "Dark mode",
  "header.personality": "Change personality",
  "header.notifications": "Notifications",
  "home.createImage": "Create image",
  "home.write": "Write or edit",
  "home.searchWeb": "Search the web",
  "home.goodMorning": "Good morning, give me the day's briefing",

  /* Code confirmation */
  "chat.useCodeTitle": "USE SOURCE CODE?",
  "chat.useCodePrompt": "Allow Jarvis to read his own code for this answer?",
  "chat.useCodeConfirm": "USE CODE",
  "chat.useCodeCancel": "SKIP CODE",
  "header.backendOffline": "Backend offline, API server may not be running",

  /* Sidebar */
  "sidebar.newChat": "New Chat",
  "sidebar.newChatLong": "New conversation",
  "sidebar.searchPlaceholder": "Search conversations…",
  "sidebar.noConversations": "No conversations yet",
  "sidebar.recentItems": "Recent items",
  "sidebar.today": "Today",
  "sidebar.yesterday": "Yesterday",
  "sidebar.previous7Days": "Previous 7 Days",
  "sidebar.older": "Older",
  "sidebar.clearAll": "Clear All",
  "sidebar.memoryActive": "Memory Active",
  "sidebar.deleteAllTitle": "Delete all conversations?",
  "sidebar.deleteAllDesc":
    "This will permanently remove every conversation. This action cannot be undone.",
  "sidebar.cancel": "Cancel",
  "sidebar.deleteAll": "Delete all",
  "sidebar.chat": "Chat",
  "sidebar.navBrowser": "Browser",
  "sidebar.navCamera": "Camera",
  "sidebar.navPlugins": "Plug-ins",

  /* Time */
  "time.justNow": "just now",
  "time.mAgo": "{n}m ago",
  "time.hAgo": "{n}h ago",
  "time.dAgo": "{n}d ago",
  "time.yesterday": "Yesterday",

  /* Settings */
  "settings.title": "Settings",
  "settings.close": "Close",
  "settings.section.customize": "Customize",
  "settings.personalization": "Personalization",
  "settings.personalizationDesc": "How Jarvis talks and responds",
  "settings.memory": "Memory",
  "settings.memoryDesc": "Facts Jarvis remembers about you",
  "settings.language": "Language",
  "settings.languageDesc": "Choose the language of the interface",
  "settings.language.en": "English",
  "settings.language.nl": "Nederlands",
  "settings.section.account": "Account",
  "settings.email": "Email",

  "settings.section.theme": "Theme",
  "settings.appearance": "Appearance",
  "settings.appearance.system": "System",
  "settings.appearance.light": "Light",
  "settings.appearance.dark": "Dark",
  "settings.section.app": "App Settings",
  "settings.webSearchData": "Web Search & Data",
  "settings.webSearchDataDesc": "Web search, weather, calendar feeds & system prompt",
  "settings.section.help": "Help",
  "settings.reportProblem": "Report a Problem",
  "settings.helpCenter": "Help Center",
  "settings.about": "About",
  "settings.signOut": "Sign Out",

  /* Settings, ChatGPT-style extras */
  "settings.accentColor": "Accent Color",
  "settings.accentColorDesc": "Choose the accent color of the interface",
  "settings.accent.blue": "Blue",
  "settings.accent.green": "Green",
  "settings.accent.purple": "Purple",
  "settings.accent.orange": "Orange",
  "settings.accent.pink": "Pink",



  /* Settings, functional sections */
  "settings.userProfile": "User Profile",
  "settings.userProfileHint":
    "A few sentences about yourself. Jarvis reads this every conversation to personalise replies.",
  "settings.memories": "Memories",
  "settings.memoriesHint":
    "Facts Jarvis has picked up during conversations. Edit or delete any entry.",
  "settings.noMemories":
    "No memories yet. Chat with Jarvis and he'll start picking things up.",
  "settings.gmail": "Gmail + Google Calendar",
  "settings.connectGmail": "Connect Google account (Gmail + Calendar)",
  "settings.gmailHint":
    "Grants Jarvis read access to your Gmail inbox and Google Calendar.",
  "settings.gmailSynced": "Gmail inbox + Google Calendar synced as {email}",
  "settings.spotify": "Spotify",
  "settings.connectSpotify": "Connect Spotify",
  "settings.spotifyHint":
    "Link your Spotify account so Jarvis can see your listening context.",
  "settings.connected": "Connected",
  "settings.disconnect": "Disconnect",
  "settings.disconnecting": "Disconnecting…",
  "settings.webSearch": "Web Search",
  "settings.webSearchHint": "Let Jarvis search the web",
  "settings.webSearchPowered": "Powered by Tavily.",
  "settings.weather": "Weather",
  "settings.weatherPlaceholder": "e.g. London, New York, Tokyo",
  "settings.weatherHint":
    "Also used for your local timezone when you ask Jarvis the time.",
  "settings.calendarFeeds": "Manual Calendar Feeds",
  "settings.addFeed": "Add feed",
  "settings.calendarHint":
    "Optional: add iCal feed URLs as a fallback when Google Calendar is not connected.",
  "settings.feedNamePlaceholder": "Feed name (e.g. Work, Personal)…",
  "settings.icalPlaceholder": "Paste iCal URL…",
  "settings.systemPrompt": "System Prompt",
  "settings.previewPrompt": "Preview System Prompt",
  "settings.promptHint": "The full instruction Jarvis follows for every response.",
  "settings.alwaysOn":
    "Always on: Jarvis always knows the current date & time, no setup needed.",
  "settings.unsaved": "Unsaved changes",
  "settings.unsavedDesc": "You have unsaved settings. Discard them?",
  "settings.keepEditing": "Keep editing",
  "settings.discard": "Discard",
  "settings.saving": "Saving…",
  "settings.saved": "All changes saved",
  "settings.autosave": "Auto-save on",
  "settings.saveNow": "Save now",
  "settings.memoryDeleted": "Memory deleted",
  "settings.forgot": "Forgot \"{topic}\".",
  "settings.couldNotDelete": "Could not delete memory",
  "settings.memoryUpdated": "Memory updated",
  "settings.couldNotUpdate": "Could not update memory",
  "settings.promptPreview": "Prompt preview",
  "settings.couldNotLoad": "Could not load prompt",
  "settings.autosaveFailed": "Auto-save failed",
  "settings.autosaveFailedDesc": "Check your connection",
  "settings.edit": "Edit",
  "settings.delete": "Delete",
  "settings.removeFeed": "Remove this feed",
  "settings.howToGetIcal": "How to get a Google Calendar iCal URL",
  "settings.loading": "Loading…",

  /* Chat input */
  "input.placeholder": "Ask Jarvis anything…",
  "input.placeholderFile": "Add a message…",
  "input.listening": "Listening… speak now",
  "input.processing": "Processing…",
  "input.send": "SEND",
  "input.dictate": "Dictate a message",
  "input.stopDictate": "Stop recording",
  "input.voiceMode": "Voice mode",
  "input.attachFile": "Attach file",
  "input.camera": "Camera",
  "input.generateImage": "Generate image",
  "input.shareScreen": "Share screen",
  "input.stopSharing": "Stop sharing",
  "input.agentMode": "Agent mode",
  "input.agentModeOn": "Agent mode ON",
  "input.webSearch": "Web search",
  "input.whatsapp": "Send via WhatsApp",

  /* New Gem */
  "gem.title": "New Gem",
  "gem.menuItem": "New Gem",
  "gem.name": "GEM NAME",
  "gem.namePlaceholder": "e.g. Quantum Engineer",
  "gem.prompt": "SYSTEM PROMPT, WHO IS THIS GEM?",
  "gem.promptPlaceholder": "You are a quantum computing engineer with 30 years of experience. You think in terms of …",
  "gem.create": "CREATE GEM",
  "gem.createdToast": "Gem created, Jarvis now speaks as this expert.",

  /* Data Lab */
  "datalab.menuItem": "Data Lab",
  "datalab.title": "Data Lab",
  "datalab.drop": "Drop your CSV here or tap to browse",
  "datalab.dropHint": "CSV / TSV, parsed 100% in your browser",
  "datalab.browse": "Browse files",
  "datalab.parsing": "Parsing…",
  "datalab.empty": "That file has no data rows.",
  "datalab.parseError": "Could not parse that file as a table.",
  "datalab.readError": "Could not read the file.",
  "datalab.column": "NUMERIC COLUMNS",
  "datalab.noNumeric": "No numeric columns found, Jarvis can still read the raw rows.",
  "datalab.min": "MIN",
  "datalab.max": "MAX",
  "datalab.mean": "MEAN",
  "datalab.sum": "SUM",
  "datalab.chart": "FIRST 50 ROWS",
  "datalab.newFile": "New file",
  "datalab.askJarvis": "Ask Jarvis to analyze",
  "menu.section.add": "ADD",
  "menu.section.create": "CREATE",
  "menu.section.power": "POWER",
  "menu.section.share": "SHARE",
  "palette.placeholder": "Search memory or run a command…",
  "palette.hint": "Type to search every conversation, or pick an action.",
  "palette.noResults": "Nothing found, try different words.",
  "palette.memory": "MEMORY",
  "palette.actions": "ACTIONS",
  "palette.theme": "Theme",
  "input.thinking": "Thinking mode",
  "input.thinkingOn": "Thinking on, Jarvis thinks before answering",
  "feed.thinking": "Thinking",
  "input.fileAttached": "File attached",
  "input.couldNotRead": "Could not read file",
  "input.dropHere": "DROP FILE HERE",
  "input.listeningStatus":
    "LISTENING, tap the square to stop",
  "input.thinkingStatus": "THINKING…",
  "input.speakingStatus": "JARVIS IS SPEAKING, ",
  "input.stop": "STOP",

  /* Voice mode */
  "voice.status.idle": "Ready",
  "voice.status.wake": "Ready",
  "voice.status.recording": "Listening",
  "voice.status.transcribing": "Transcribing",
  "voice.status.thinking": "Thinking",
  "voice.status.speaking": "Speaking",
  "voice.hint.chat": "Type in the chat panel",
  "voice.backToChat": "Back to chat",
  "voice.hint.ready": "Say 'hey Jarvis' or tap orb to talk",
  "voice.hint.recording": "Speak now, pausing will send your message",
  "voice.hint.speaking": "Tap orb to interrupt",
  "voice.hint.transcribing": "Got it…",
  "voice.hint.thinking": "Thinking…",
  "voice.stop": "Stop",
  "voice.agentOn": "Agent On",
  "voice.agent": "Agent",
  "voice.browserOn": "Browser On",
  "voice.browser": "Browser",
  "voice.camOn": "Cam On",
  "voice.cam": "Cam",

  /* Deep research */
  "research.title": "Deep Research",
  "build.menuItem": "Build Mode",
  "build.title": "Build Mode",
  "build.terminalHint": "Linux sandbox, ask Jarvis to build something",
  "research.placeholder": "What should I research? Describe the goal in as much detail as you want…",
  "research.depth": "DEPTH",
  "research.mode": "MODE",
  "research.mode.agent": "Agent",
  "research.mode.normal": "Normal",
  "research.mode.both": "Both",
  "research.mode.agent.hint": "Full autonomy, explores tangents and verifies claims on its own.",
  "research.mode.normal.hint": "Focused, searches straight for your goal, less exploration.",
  "research.mode.both.hint": "Tavily-first; any query Tavily can't answer automatically falls back to agent mode for that query, then continues on Tavily.",
  "research.start": "Start research",
  "research.confirmTitle": "START DEEP RESEARCH?",
  "research.confirmBody": "This runs in the background for a very long time, at least 5 hours, often days, with no depth limit. Jarvis researches, re-plans and deepens continuously, then notifies you and creates a special expert 'gem' chat when it's done.",
  "research.confirm": "CONFIRM",
  "research.cancel": "Cancel",
  "research.jobs": "RESEARCH JOBS",
  "research.noJobs": "No research jobs yet. Start one above, it runs in the cloud for hours or days.",
  "research.status.queued": "Queued",
  "research.status.running": "Running",
  "research.status.completed": "Done",
  "research.status.failed": "Failed",
  "research.status.cancelled": "Cancelled",
  "research.cancelJob": "Cancel",
  "research.openGem": "Open gem",
  "research.notificationTitle": "Research complete",
  "research.notificationBody": "Your deep research finished, the expert gem is ready.",
  /* LLM keys */
  "settings.llmKeys": "LLM Keys",
  "settings.llmKeysDesc": "Multiple AI providers & keys with automatic failover, if one runs out, Jarvis silently switches",
  "settings.llmKeysAdd": "ADD A KEY",
  "settings.llmKeysAddBtn": "Add key",
  "settings.llmKeysName": "Name (e.g. OpenRouter free)",
  "settings.llmKeysSecret": "API key",
  "settings.llmKeysBaseUrl": "Base URL (OpenAI-compatible, e.g. https://integrate.api.nvidia.com/v1)",
  "settings.llmKeysModel": "Model (optional, defaults to the server model)",
  "settings.llmKeysNone": "No keys yet, add one above, or use the server env key.",
  "settings.llmKeysMissing": "Name, API key and base URL are required",
  "settings.keyAdded": "Key added, it is now in the rotation pool",
  "settings.couldNotAddKey": "Could not add key",
  "settings.keyOk": "Key works",
  "settings.keyTestFailed": "Key test failed",
  "settings.llmTest": "Test key",
  "settings.llmToggle": "Toggle enabled",
  "settings.llmDelete": "Delete key",
  "settings.llmUses": "uses",
  "settings.llmFailures": "fails",
  "settings.llmStatus.healthy": "healthy",
  "settings.llmStatus.cooling": "cooling",
  "settings.llmStatus.quarantined": "quarantined",
  /* Personality */
  "settings.personality": "Personality",
  "settings.personalityDesc": "How Jarvis talks to you",
  "settings.personality.auto": "Auto (AI decides)",
  "settings.personality.balanced": "Balanced",
  "settings.personality.talkative": "Talkative",
  "settings.personality.helpful": "Helpful",
  "settings.personality.concise": "Just gets it done",
  "settings.personality.custom": "Custom",
  "settings.customPromptLabel": "Custom personality prompt",
  "settings.customPromptHint": "This replaces Jarvis's base instructions entirely, write whatever rules you want",
  "settings.customPromptPlaceholder": "e.g. You are my sarcastic British butler. Always start with a dry remark…",
  "voice.cameraMode": "Camera mode",



  /* Emotion labels */
  "emotion.calm": "calm",
  "emotion.excited": "excited",
  "emotion.frustrated": "frustrated",
  "emotion.stressed": "stressed",
  "emotion.tired": "tired",
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Dutch dictionary
 * ────────────────────────────────────────────────────────────────────────── */
const nl: Record<keyof typeof en, string> = {
  /* Header */
  "header.title": "Jarvis",
  "header.search": "Zoeken",
  "header.settings": "Instellingen",
  "header.mode.voice": "Stem",
  "header.mode.chat": "Chat",
  "header.mode.agent": "Agent",
  "header.mode.camera": "Camera",
  "header.lightMode": "Lichte modus",
  "header.darkMode": "Donkere modus",
  "header.personality": "Persoonlijkheid wijzigen",
  "header.notifications": "Meldingen",
  "home.createImage": "Afbeelding maken",
  "home.write": "Schrijven of bewerken",
  "home.searchWeb": "Zoeken op het web",
  "home.goodMorning": "Goedemorgen, geef me de briefing van de dag",

  /* Code confirmation */
  "chat.useCodeTitle": "BRONCODE GEBRUIKEN?",
  "chat.useCodePrompt": "Mag Jarvis zijn eigen code lezen voor dit antwoord?",
  "chat.useCodeConfirm": "GEBRUIK CODE",
  "chat.useCodeCancel": "ZONDER CODE",
  "header.backendOffline":
    "Backend offline, de API-server draait mogelijk niet",

  /* Sidebar */
  "sidebar.newChat": "Nieuw gesprek",
  "sidebar.newChatLong": "Nieuw gesprek",
  "sidebar.searchPlaceholder": "Gesprekken doorzoeken…",
  "sidebar.noConversations": "Nog geen gesprekken",
  "sidebar.recentItems": "Recente items",
  "sidebar.today": "Vandaag",
  "sidebar.yesterday": "Gisteren",
  "sidebar.previous7Days": "Afgelopen 7 dagen",
  "sidebar.older": "Ouder",
  "sidebar.clearAll": "Alles wissen",
  "sidebar.memoryActive": "Geheugen actief",
  "sidebar.deleteAllTitle": "Alle gesprekken verwijderen?",
  "sidebar.deleteAllDesc":
    "Hiermee worden alle gesprekken permanent verwijderd. Deze actie kan niet ongedaan worden gemaakt.",
  "sidebar.cancel": "Annuleren",
  "sidebar.deleteAll": "Alles verwijderen",
  "sidebar.chat": "Chat",
  "sidebar.navBrowser": "Browser",
  "sidebar.navCamera": "Camera",
  "sidebar.navPlugins": "Plug-ins",

  /* Time */
  "time.justNow": "zojuist",
  "time.mAgo": "{n} min geleden",
  "time.hAgo": "{n} u geleden",
  "time.dAgo": "{n} d geleden",
  "time.yesterday": "Gisteren",

  /* Settings */
  "settings.title": "Instellingen",
  "settings.close": "Sluiten",
  "settings.section.customize": "Jarvis aanpassen",
  "settings.personalization": "Personalisatie",
  "settings.personalizationDesc": "Hoe Jarvis praat en reageert",
  "settings.memory": "Geheugen",
  "settings.memoryDesc": "Feiten die Jarvis over jou onthoudt",
  "settings.language": "Taal",
  "settings.languageDesc": "Kies de taal van de interface",
  "settings.language.en": "Engels",
  "settings.language.nl": "Nederlands",
  "settings.section.account": "Account",
  "settings.email": "E-mailadres",

  "settings.section.theme": "Thema",
  "settings.appearance": "Vormgeving",
  "settings.appearance.system": "Systeem",
  "settings.appearance.light": "Licht",
  "settings.appearance.dark": "Donker",
  "settings.section.app": "App-instellingen",
  "settings.webSearchData": "Webzoeken & gegevens",
  "settings.webSearchDataDesc": "Webzoeken, weer, kalenderfeeds en systeemprompt",
  "settings.section.help": "Hulp",
  "settings.reportProblem": "App-probleem melden",
  "settings.helpCenter": "Helpcentrum",
  "settings.about": "Over",
  "settings.signOut": "Afmelden",

  /* Settings, ChatGPT-style extras */
  "settings.accentColor": "Accentkleur",
  "settings.accentColorDesc": "Kies de accentkleur van de interface",
  "settings.accent.blue": "Blauw",
  "settings.accent.green": "Groen",
  "settings.accent.purple": "Paars",
  "settings.accent.orange": "Oranje",
  "settings.accent.pink": "Roze",



  /* Settings, functional sections */
  "settings.userProfile": "Gebruikersprofiel",
  "settings.userProfileHint":
    "Een paar zinnen over jezelf. Jarvis leest dit bij elk gesprek om antwoorden te personaliseren.",
  "settings.memories": "Geheugen",
  "settings.memoriesHint":
    "Feiten die Jarvis tijdens gesprekken heeft opgepikt. Bewerk of verwijder elk item.",
  "settings.noMemories":
    "Nog geen herinneringen. Praat met Jarvis en hij begint dingen op te pikken.",
  "settings.gmail": "Gmail + Google Agenda",
  "settings.connectGmail": "Google-account verbinden (Gmail + Agenda)",
  "settings.gmailHint":
    "Geeft Jarvis leestoegang tot je Gmail-inbox en Google Agenda.",
  "settings.gmailSynced":
    "Gmail-inbox + Google Agenda gesynchroniseerd als {email}",
  "settings.spotify": "Spotify",
  "settings.connectSpotify": "Spotify verbinden",
  "settings.spotifyHint":
    "Koppel je Spotify-account zodat Jarvis je luistercontext kan zien.",
  "settings.connected": "Verbonden",
  "settings.disconnect": "Verbinding verbreken",
  "settings.disconnecting": "Verbinding verbreken…",
  "settings.webSearch": "Webzoekopdracht",
  "settings.webSearchHint": "Laat Jarvis op internet zoeken",
  "settings.webSearchPowered": "Mogelijk gemaakt door Tavily.",
  "settings.weather": "Weer",
  "settings.weatherPlaceholder": "bijv. Londen, New York, Tokio",
  "settings.weatherHint":
    "Wordt ook gebruikt voor je lokale tijdzone wanneer je Jarvis naar de tijd vraagt.",
  "settings.calendarFeeds": "Handmatige kalenderfeeds",
  "settings.addFeed": "Feed toevoegen",
  "settings.calendarHint":
    "Optioneel: voeg iCal-feed-URL's toe als back-up wanneer Google Agenda niet is verbonden.",
  "settings.feedNamePlaceholder": "Feednaam (bijv. Werk, Privé)…",
  "settings.icalPlaceholder": "Plak iCal-URL…",
  "settings.systemPrompt": "Systeemprompt",
  "settings.previewPrompt": "Systeemprompt bekijken",
  "settings.promptHint":
    "De volledige instructie die Jarvis bij elke reactie volgt.",
  "settings.alwaysOn":
    "Altijd aan: Jarvis kent altijd de huidige datum & tijd, geen instelling nodig.",
  "settings.unsaved": "Niet-opgeslagen wijzigingen",
  "settings.unsavedDesc": "Je hebt niet-opgeslagen instellingen. Weggooien?",
  "settings.keepEditing": "Blijf bewerken",
  "settings.discard": "Weggooien",
  "settings.saving": "Opslaan…",
  "settings.saved": "Alle wijzigingen opgeslagen",
  "settings.autosave": "Auto-opslaan aan",
  "settings.saveNow": "Nu opslaan",
  "settings.memoryDeleted": "Herinnering verwijderd",
  "settings.forgot": "\"{topic}\" vergeten.",
  "settings.couldNotDelete": "Herinnering kon niet worden verwijderd",
  "settings.memoryUpdated": "Herinnering bijgewerkt",
  "settings.couldNotUpdate": "Herinnering kon niet worden bijgewerkt",
  "settings.promptPreview": "Promptvoorbeeld",
  "settings.couldNotLoad": "Prompt kon niet worden geladen",
  "settings.autosaveFailed": "Auto-opslaan mislukt",
  "settings.autosaveFailedDesc": "Controleer je verbinding",
  "settings.edit": "Bewerken",
  "settings.delete": "Verwijderen",
  "settings.removeFeed": "Deze feed verwijderen",
  "settings.howToGetIcal": "Een Google Agenda iCal-URL verkrijgen",
  "settings.loading": "Laden…",

  /* Chat input */
  "input.placeholder": "Vragen aan Jarvis…",
  "input.placeholderFile": "Voeg een bericht toe…",
  "input.listening": "Luisteren… spreek nu",
  "input.processing": "Bezig…",
  "input.send": "VERSTUUR",
  "input.dictate": "Bericht dicteren",
  "input.stopDictate": "Opname stoppen",
  "input.voiceMode": "Spraakmodus",
  "input.attachFile": "Bestand toevoegen",
  "input.camera": "Camera",
  "input.generateImage": "Afbeelding genereren",
  "input.shareScreen": "Scherm delen",
  "input.stopSharing": "Delen stoppen",
  "input.agentMode": "Agentmodus",
  "input.agentModeOn": "Agentmodus AAN",
  "input.webSearch": "Webzoekopdracht",
  "input.whatsapp": "Versturen via WhatsApp",

  /* New Gem */
  "gem.title": "Nieuwe Gem",
  "gem.menuItem": "Nieuwe Gem",
  "gem.name": "GEM-NAAM",
  "gem.namePlaceholder": "bijv. Quantum Engineer",
  "gem.prompt": "SYSTEEMPROMPT, WIE IS DEZE GEM?",
  "gem.promptPlaceholder": "Je bent een quantumcomputer-ingenieur met 30 jaar ervaring. Je denkt in termen van …",
  "gem.create": "GEM MAKEN",
  "gem.createdToast": "Gem gemaakt, Jarvis spreekt nu als deze expert.",

  /* Data Lab */
  "datalab.menuItem": "Data Lab",
  "datalab.title": "Data Lab",
  "datalab.drop": "Sleep je CSV hierheen of tik om te bladeren",
  "datalab.dropHint": "CSV / TSV, 100% in je browser verwerkt",
  "datalab.browse": "Bladeren",
  "datalab.parsing": "Verwerken…",
  "datalab.empty": "Dat bestand bevat geen datarijen.",
  "datalab.parseError": "Kon dat bestand niet als tabel lezen.",
  "datalab.readError": "Kon het bestand niet lezen.",
  "datalab.column": "NUMERIEKE KOLOMMEN",
  "datalab.noNumeric": "Geen numerieke kolommen gevonden, Jarvis kan de ruwe rijen nog steeds lezen.",
  "datalab.min": "MIN",
  "datalab.max": "MAX",
  "datalab.mean": "GEM.",
  "datalab.sum": "SOM",
  "datalab.chart": "EERSTE 50 RIJEN",
  "datalab.newFile": "Nieuw bestand",
  "datalab.askJarvis": "Laat Jarvis analyseren",
  "menu.section.add": "TOEVOEGEN",
  "menu.section.create": "MAKEN",
  "menu.section.power": "KRACHT",
  "menu.section.share": "DELEN",
  "palette.placeholder": "Zoek in geheugen of voer een commando uit…",
  "palette.hint": "Typ om elke conversatie te doorzoeken, of kies een actie.",
  "palette.noResults": "Niets gevonden, probeer andere woorden.",
  "palette.memory": "GEHEUGEN",
  "palette.actions": "ACTIES",
  "palette.theme": "Thema",
  "input.thinking": "Denkmodus",
  "input.thinkingOn": "Denkmodus aan, Jarvis denkt eerst na",
  "feed.thinking": "Denken",
  "input.fileAttached": "Bestand toegevoegd",
  "input.couldNotRead": "Bestand kon niet worden gelezen",
  "input.dropHere": "ZET BESTAND HIER NEER",
  "input.listeningStatus":
    "LUISTEREN, tik op het vierkant om te stoppen",
  "input.thinkingStatus": "BEZIG MET DENKEN…",
  "input.speakingStatus": "JARVIS SPREEKT, ",
  "input.stop": "STOP",

  /* Voice mode */
  "voice.status.idle": "Klaar",
  "voice.status.wake": "Klaar",
  "voice.status.recording": "Luisteren",
  "voice.status.transcribing": "Omzetten",
  "voice.status.thinking": "Denken",
  "voice.status.speaking": "Spreken",
  "voice.hint.chat": "Typ in het chatpaneel",
  "voice.backToChat": "Terug naar chat",
  "voice.hint.ready": "Zeg 'hey Jarvis' of tik op de bol om te praten",
  "voice.hint.recording": "Spreek nu, pauzeren verstuurt je bericht",
  "voice.hint.speaking": "Tik op de bol om te onderbreken",
  "voice.hint.transcribing": "Begrepen…",
  "voice.hint.thinking": "Denken…",
  "voice.stop": "Stoppen",
  "voice.agentOn": "Agent aan",
  "voice.agent": "Agent",
  "voice.browserOn": "Browser aan",
  "voice.browser": "Browser",
  "voice.camOn": "Cam aan",
  "voice.cam": "Cam",

  /* Diep onderzoek */
  "research.title": "Diep Onderzoek",
  "build.menuItem": "Bouwnodus",
  "build.title": "Bouwnodus",
  "build.terminalHint": "Linux-sandbox, vraag Jarvis om iets te bouwen",
  "research.placeholder": "Wat moet ik onderzoeken? Beschrijf het doel zo gedetailleerd als je wilt…",
  "research.depth": "DIEPTE",
  "research.mode": "MODUS",
  "research.mode.agent": "Agent",
  "research.mode.normal": "Normaal",
  "research.mode.both": "Beide",
  "research.mode.agent.hint": "Volledige autonomie, verkent zijpaden en verifieert beweringen zelf.",
  "research.mode.normal.hint": "Gericht, zoekt direct naar je doel, minder verkenning.",
  "research.mode.both.hint": "Eerst Tavily; elke zoekopdracht die Tavily niet kan beantwoorden valt automatisch terug op agent-modus en gaat daarna verder op Tavily.",
  "research.start": "Start onderzoek",
  "research.confirmTitle": "DIEP ONDERZOEK STARTEN?",
  "research.confirmBody": "Dit draait op de achtergrond voor heel lang, minimaal 5 uur, vaak dagen, zonder dieptelimiet. Jarvis onderzoekt, plant opnieuw en verdiept continu, stuurt je een melding en maakt een speciale expert-‘gem’-chat wanneer het klaar is.",
  "research.confirm": "BEVESTIG",
  "research.cancel": "Annuleren",
  "research.jobs": "ONDERZOEKSJOBS",
  "research.noJobs": "Nog geen onderzoeksjobs. Start er hierboven een, het draait uren of dagen in de cloud.",
  "research.status.queued": "In wachtrij",
  "research.status.running": "Bezig",
  "research.status.completed": "Klaar",
  "research.status.failed": "Mislukt",
  "research.status.cancelled": "Geannuleerd",
  "research.cancelJob": "Annuleren",
  "research.openGem": "Open gem",
  "research.notificationTitle": "Onderzoek klaar",
  "research.notificationBody": "Je diepe onderzoek is klaar, de expert-gem staat klaar.",
  /* LLM-sleutels */
  "settings.llmKeys": "LLM-sleutels",
  "settings.llmKeysDesc": "Meerdere AI-providers en -sleutels met automatische failover, als een op is, schakelt Jarvis stil over",
  "settings.llmKeysAdd": "SLEUTEL TOEVOEGEN",
  "settings.llmKeysAddBtn": "Sleutel toevoegen",
  "settings.llmKeysName": "Naam (bijv. OpenRouter gratis)",
  "settings.llmKeysSecret": "API-sleutel",
  "settings.llmKeysBaseUrl": "Basis-URL (OpenAI-compatibel, bijv. https://integrate.api.nvidia.com/v1)",
  "settings.llmKeysModel": "Model (optioneel, standaard het servermodel)",
  "settings.llmKeysNone": "Nog geen sleutels, voeg er hierboven een toe, of gebruik de server-env-sleutel.",
  "settings.llmKeysMissing": "Naam, API-sleutel en basis-URL zijn verplicht",
  "settings.keyAdded": "Sleutel toegevoegd, hij zit nu in de rotatiepool",
  "settings.couldNotAddKey": "Sleutel kon niet worden toegevoegd",
  "settings.keyOk": "Sleutel werkt",
  "settings.keyTestFailed": "Sleuteltest mislukt",
  "settings.llmTest": "Test sleutel",
  "settings.llmToggle": "In-/uitschakelen",
  "settings.llmDelete": "Sleutel verwijderen",
  "settings.llmUses": "gebruiken",
  "settings.llmFailures": "mislukt",
  "settings.llmStatus.healthy": "gezond",
  "settings.llmStatus.cooling": "afkoelen",
  "settings.llmStatus.quarantined": "gequarantaineerd",
  /* Persoonlijkheid */
  "settings.personality": "Persoonlijkheid",
  "settings.personalityDesc": "Hoe Jarvis met je praat",
  "settings.personality.auto": "Auto (AI beslist)",
  "settings.personality.balanced": "Gebalanceerd",
  "settings.personality.talkative": "Praatgraag",
  "settings.personality.helpful": "Behulpzaam",
  "settings.personality.concise": "Gewoon afmaken",
  "settings.personality.custom": "Eigen",
  "settings.customPromptLabel": "Eigen persoonlijkheidsprompt",
  "settings.customPromptHint": "Dit vervangt de basisinstructies van Jarvis volledig, schrijf je eigen regels",
  "settings.customPromptPlaceholder": "bijv. Je bent mijn sarcastische Britse butler. Begin altijd met een droge opmerking…",
  "voice.cameraMode": "Cameramodus",



  /* Emotie-labels */
  "emotion.calm": "kalm",
  "emotion.excited": "opgewonden",
  "emotion.frustrated": "gefrustreerd",
  "emotion.stressed": "gestrest",
  "emotion.tired": "moe",
};

export type TranslationKey = keyof typeof en;

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "jarvis-language";

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "nl") return stored;
  } catch {
    /* ignore */
  }
  // Default to the browser's language when it is Dutch
  try {
    if (navigator.language?.toLowerCase().startsWith("nl")) return "nl";
  } catch {
    /* ignore */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang === "nl" ? "nl" : "en";
  }, [lang]);

  const setLang = useCallback((next: Language) => setLangState(next), []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      let template: string = lang === "nl" ? nl[key] : en[key];
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          template = template.replaceAll(`{${k}}`, String(v));
        }
      }
      return template;
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }
  return ctx;
}
