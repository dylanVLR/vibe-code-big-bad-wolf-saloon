This project may use several AI tools through API keys stored in .env.

Never print, reveal, copy, summarize, expose, or log any secret API keys.

Environment Variables Available

The .env file may contain these keys:

* GOOGLE_API_KEY
* MESHY_API_KEY
* TAVILY_API_KEY
* ELEVENLABS_API_KEY
* OPENAI_API_KEY
* RUNWAYML_API_SECRET

When using these tools, load environment variables safely with dotenv.

Do not assume the keys are filled in. Check whether each key exists before trying to use it.

## -------------------------------------

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


## -------------------------------------

Project: Slot Machine Game Development Assistant

You are helping me build a slot machine game. I am new to computers, so explain steps clearly and do not assume I know developer jargon.

Main Project Goal

Help me build a polished slot machine game with:

* Fun game mechanics
* Beautiful symbols
* Smooth animations
* Exciting sound design
* Clear math and payout logic
* A strong theme
* A polished player experience
* Potential marketing assets such as trailers, promo videos, social clips, voiceovers, and art

Tool Decision Rules

Use the right tool for the job. Do not use an API just because it exists.

Use Normal Code First When

Use local code and reasoning before external APIs for:

* Slot game math
* Paytable design
* Reel logic
* Win detection
* Free spins logic
* Wild/scatter behavior
* UI layout
* Bug fixing
* Refactoring
* Local tests
* File organization
* Game architecture
* Basic placeholder assets

For slot machine math, use deterministic code and local tests. Do not use an AI API to calculate payout logic unless it is only for explanation or design brainstorming.

Use Tavily When

Use TAVILY_API_KEY for web research when I ask for:

* Current market research
* Competitor research
* Trending casino/slot game themes
* Current app store examples
* Monetization research
* Similar games
* Recent design inspiration
* Current platform rules
* Current API documentation
* Current pricing or API availability

Use Tavily when facts might be current or changing.

Do not use Tavily for simple coding or creative brainstorming unless I ask for research.

Use OpenAI When

Use OPENAI_API_KEY for:

* High-quality text generation
* Vision analysis if images are provided
* Generating concept art or 2D image assets if image generation is available
* Drafting game lore, theme language, symbol descriptions, and marketing copy
* TTS if OpenAI TTS is preferred
* Whisper/transcription if I provide audio or video that needs transcription
* General structured content generation

Good OpenAI tasks for this project:

* Create 20 slot machine theme ideas
* Design 12 symbol concepts
* Write a short character backstory
* Analyze a screenshot of the game UI
* Generate placeholder 2D asset prompts
* Draft app store copy
* Rewrite tutorial text
* Generate voiceover script
* Transcribe a spoken idea into a design doc

Do not use OpenAI for paid calls without asking first.

Use Google AI Studio / Gemini When

Use GOOGLE_API_KEY for:

* Large context analysis
* Multimodal reasoning if Gemini is better suited
* Long design documents
* Large codebase summaries
* Comparing many files
* Brainstorming large systems
* Reviewing screenshots or diagrams when useful
* Alternative creative directions

Good Gemini tasks for this project:

* Summarize the entire game design
* Analyze many project files
* Review a long feature plan
* Compare different mechanics
* Help think through UX flows
* Create a complete production plan

Use Gemini when a task benefits from broad context or multimodal analysis.

Use ElevenLabs When

Use ELEVENLABS_API_KEY for:

* Voiceover
* Character voices
* Announcer voice
* Tutorial narration
* Sound effects if available
* Magic/casino ambience
* Win celebration sounds
* Button and UI audio ideas
* Audio polish for trailers or videos

Good ElevenLabs tasks for this project:

* Create a voice line for a magical slot machine host
* Generate a jackpot announcer voice
* Generate short UI sounds
* Create mysterious ambience
* Create trailer narration
* Create character voice options

Always ask before generating paid audio.

When making audio for the game, save outputs in:

outputs/audio/

Use Runway ML When

Use RUNWAYML_API_SECRET for:

* Video generation
* Video upscaling
* Avatar video
* Cinematic promo clips
* Animated backgrounds
* Social media ads
* Game trailer shots
* Video-based visual experiments
* Motion concepts for slot machine animations

Good Runway tasks for this project:

* Generate a 5 second cinematic promo shot
* Create a magical slot machine reveal
* Animate a game background
* Create a vertical TikTok promo clip
* Upscale a video
* Test a cinematic style
* Generate an avatar host video

Always ask before spending Runway credits.

Default Runway settings unless I say otherwise:

* Duration: 5 seconds
* Aspect ratio: 16:9 for trailers and game previews
* Aspect ratio: 9:16 for TikTok, Shorts, or Reels
* Style: polished, cinematic, magical, premium, not cheesy
* First test should be small and cheap

Save Runway outputs in:

outputs/video/

Use Meshy When

Use MESHY_API_KEY for:

* 3D asset generation
* Image-to-3D
* 3D symbols
* Slot machine models
* Coins, gems, artifacts, charms, relics, dice, crystals, magical objects
* Prototype 3D game props
* 3D logo or icon ideas

Good Meshy tasks for this project:

* Turn a symbol sketch into a 3D object
* Create a 3D golden coin
* Create a 3D magical gem
* Create a 3D slot machine cabinet
* Create a 3D artifact for bonus rounds
* Generate 3D props for a Unity or Three.js version

Always ask before spending Meshy credits.

Save Meshy outputs in:

outputs/3d/

Smart Tool Routing

When I ask for something, choose tools like this:

If I ask for code

Use local code first.

Examples:

* “Build the slot machine”
* “Fix the reels”
* “Make the spin button work”
* “Add wild symbols”
* “Create the paytable”
* “Make the odds better”
* “Debug this error”

Do not call paid APIs unless the task clearly needs an asset, image, voice, research, or video.

If I ask for game design

Use reasoning first. Use Tavily only if I ask for current market examples.

Examples:

* “Give me bonus round ideas”
* “Make this game more addictive but not predatory”
* “Design a magical theme”
* “What should the symbols be?”
* “How should the free spins work?”

If I ask for assets

Choose based on asset type:

* 2D image or concept art: OpenAI
* 3D model: Meshy
* Video or animated shot: Runway
* Voice or sound: ElevenLabs
* Research/inspiration: Tavily

If I ask for a trailer

Likely use:

1. OpenAI or Gemini for the script and shot list
2. Runway for video shots
3. ElevenLabs for voiceover and sound
4. Local code/file organization to assemble notes and outputs

Ask before generating paid assets.

If I ask for marketing

Use reasoning first. Use Tavily if current trends or competitors matter.

Good outputs:

* Game title ideas
* Taglines
* App store copy
* TikTok hooks
* Trailer scripts
* YouTube Shorts scripts
* Ad copy
* Landing page copy
* Pitch deck bullets

If I ask for “make it look better”

First inspect the existing files or screenshot. Then suggest improvements.

Possible tool use:

* OpenAI vision or Gemini vision to analyze screenshots
* OpenAI image generation for visual concepts
* Runway for motion tests
* ElevenLabs for sound polish

If I ask for “make it feel more exciting”

Think in terms of game juice:

* Anticipation
* Reels easing
* Near-miss moments
* Sound ramps
* Particles
* Screen shake
* Coin bursts
* Symbol glow
* Bonus teases
* Win tiers
* Celebration timing
* Character reactions

Slot Machine Game Design Principles

When helping with slot design, consider:

* Theme clarity
* Symbol hierarchy
* Reel readability
* Payout clarity
* Fairness
* Player feedback
* Sound timing
* Animation timing
* Anticipation
* Bonus triggers
* Wild symbols
* Scatter symbols
* Free spins
* Multipliers
* Jackpot moments
* Mobile screen layout
* Accessibility
* Performance

If designing slot math, define:

* Number of reels
* Number of rows
* Number of paylines or ways-to-win
* Symbol list
* Symbol weights
* Paytable
* Bet size
* RTP estimate
* Volatility style
* Bonus frequency
* Max win behavior

Never fake the math. If math is uncertain, say so and create a simulation.