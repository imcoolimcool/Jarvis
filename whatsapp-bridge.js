const express = require('express');
const bodyParser = require('body-parser');
const { exec, spawn } = require('child_process');
const fetch = require('node-fetch'); // 🌟 Zorgt dat de web-aanroep stabiel werkt

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// 🔒 JOUW GEGEVENS
const JOUW_NUMMER = "31657288331"; 
const CALLMEBOT_API_KEY = "4774310"; // Vul hier je ontvangen sleutel in!

// 🚀 STAP 0: START OMNIROUTE DIRECT OP DE ACHTERGROND
console.log('⚡ OmniRoute server aan het opstarten op poort 20128...');
const omnirouteProcess = spawn('omniroute', ['serve'], { 
    shell: true,
    detached: true,
    stdio: 'ignore'
});
omnirouteProcess.unref();

const folderConfig = {
    "jarvis": {
        conversation: "Jarvis",
        folder: "/workspaces/Jarvis",
        env: {
            ANTHROPIC_BASE_URL: "http://localhost:20128",
            ANTHROPIC_AUTH_TOKEN: "sk-2535363cc0d37fa7-f00e7b-3f4f64b2",
            ANTHROPIC_MODEL: "auto/best-free",
            ANTHROPIC_SMALL_FAST_MODEL: "auto/best-free",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "auto/best-free",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "auto/best-free"
        }
    },
    "free": {
        conversation: "Only_free_one", 
        folder: "/workspaces/Jarvis/new-project",
        env: {
            ANTHROPIC_BASE_URL: "http://localhost:20128",
            ANTHROPIC_AUTH_TOKEN: "sk-2535363cc0d37fa7-f00e7b-3f4f64b2",
            ANTHROPIC_MODEL: "auto/best-free",
            ANTHROPIC_SMALL_FAST_MODEL: "auto/best-free",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "auto/best-free",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "auto/best-free"
        }
    }
};

app.all('/webhook', (req, res) => {
    const rawText = req.query.message || req.body.message || "";
    if (!rawText) return res.status(400).send("Geen bericht ontvangen.");

    let activeConfig = null;
    let cleanPrompt = "";

    if (rawText.toLowerCase().startsWith('j/')) {
        activeConfig = folderConfig["jarvis"];
        cleanPrompt = rawText.substring(2).trim();
    } else if (rawText.toLowerCase().startsWith('o/')) {
        activeConfig = folderConfig["free"];
        cleanPrompt = rawText.substring(2).trim();
    }

    if (activeConfig && cleanPrompt) {
        console.log(`🚀 Commando ontvangen voor [${activeConfig.conversation}]: ${cleanPrompt}`);

        const fullCommand = `cd '${activeConfig.folder}' && claude "$CLAUDE_PROMPT" --conversation '${activeConfig.conversation}' --yes --dangerously-allow-all-anyway`;
        const runningEnv = { ...process.env, ...activeConfig.env, CLAUDE_PROMPT: cleanPrompt };

        res.status(200).send(`⏳ Claude is bezig in ${activeConfig.conversation}... Check zo WhatsApp!`);

        exec(fullCommand, { env: runningEnv }, (err, stdout, stderr) => {
            const output = stdout || stderr || "Uitgevoerd.";
            const cleanOutput = output.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').replace(/\x08/g, ''); 
            
            const replyText = encodeURIComponent(`🤖 *[Sessie: ${activeConfig.conversation}]*\n\n${cleanOutput.slice(0, 3000)}`);
            const callmebotUrl = `https://callmebot.com{JOUW_NUMMER}&text=${replyText}&apikey=${CALLMEBOT_API_KEY}`;
            
            fetch(callmebotUrl).catch(e => console.error("Fout bij terug-appen:", e));
        });
    } else {
        res.status(200).send("Prefix niet herkend. Gebruik j/ of o/");
    }
});

app.listen(3000, () => {
    console.log('🔒 MULTI-FOLDER WEBHOOK IS LIVE OP POORT 3000.');
});
