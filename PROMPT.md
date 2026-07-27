# EasyPlaywrightMCP — Original Prompt

I want to create an mcp with playwright for llm driven automated testing and demo videos. Call it EasyPlaywrightMCP. Create a new folder in my github dir and init the project (node). Use ZOD, make sure everything it type checked, and make sure the text and documentation include prominent type examples.

Use (Playwright synthetic-cursor capture, 1920×1080 @ dsf 2, WebM→H.264, 60fps
minterpolate, smooth rAF scroll, capture crispness) and Microsoft Edge neural TTS via edge-tts

It should have the following tools:
Login - This orchestrates a login operation and saves all local state (credentials - oauth or otherwise). It can handle password or manual (including oauth). If enough information (including oauth creds) is provided in params to login, it does so automatically (headless), otherwise it opens a window and waits for the user to login. Handle as many common login approaches as possible. Articulate supported processes in the plan and tests.
	Params - Site URL, Auth URL.
	Optional - user/pass, oauth creds, tokens, etc..
	Return - success or failure reason
Start Session - Starts a headless or windowed playwright session and holds it open for further user
	Optional - starting url,  record video output path (does not record if not provided)
	Return - identifying information for session (so it can be retrieved later)
Query Sessions - Returns all active sessions
Query Session - Returns enough page data for the llm to make decisions on how to navigate and interact with the page (should be fast)
	Params - session identity
	Return -  page data
Orchestrate Session - Allows the llm to provide multiple tap, cursor, or keyboard instructions to be executed in playright. Should allow for controlled (timed, fast or slow) cursor movement. Input should include a description of each action performed from an app perspective. Input should have start and end timestamps for each action.
	Params - session identity, orchestration commands
	Optional -, record steps path (stores an md with commands executed and their result if provided, does not make md if not provided)
	Return - full detail command list each with success or failure reason (same as md above)
End Session - Ends a session
	Params - session identity
	Return - success or failure reason
Compile Demo - Takes a list of Demo videos created from orchestration steps and start-end timestamped text for narration. It adds the text to the video, adds voiceover to the video, compiles the segments into seamless video. This tool will use a determinstic (coded) version of the c:\Users\tsell\OneDrive\Documents\GitHub\demo-video.md tool and follow the same techniques. 
	Params - Content list (video location with timestamped text for the video, or powerpoint-esque segways or intros), output location
	Return - success or failure reason


Make sure the instructions for the llm that the MCP provides focus on the two intended workflows:
Automated testing - Prep by login and start session. Query, orchestrate, and repeat to accomplish task. End session. Report concise results to user with a short answer.
Demo Videos - Prep by login and start session with record enabled. Query, orechestrate with md output, and repeat. Once all clips have been recorded, make sure all sessions are terminated, review the md orchestration logs, and use the compile demo tool to generate the video

Documentation and testing - Save a copy of this prompt as an md in the project. In the main MD focus on the prompted functionality and the intended workflows. Keep it simple and focused. 
Create unique install mds for Cursor, Claude, and their clis.
