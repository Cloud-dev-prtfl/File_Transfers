# **Architecture, Implementation, and Lifecycle Management of Claude Code:**  

## **Principles of Agentic Engineering and System Foundations**

Software development tooling has evolved from static syntax highlighting to predictive, autonomous development systems.1 For engineers entering the profession, understanding this paradigm shift is essential. Traditional code assistants rely on autocomplete models, which predict subsequent characters, words, or individual functions as an operator types.1 While useful, autocomplete functions at a local level, leaving the tasks of planning, system verification, and deployment to the human engineer.1  
Claude Code introduces an agentic system.1 An agentic system functions with an operational level of autonomy.1 Instead of reacting to a single prompt, the system evaluates a user-defined goal, inspects the codebase, plans a sequence of modifications, writes changes across multiple files, executes local test suites, and iterates on failures.1

\+--------------------------------------------------------+  
|                      User Prompt                       |  
\+--------------------------------------------------------+  
                           |  
                           v  
\+--------------------------------------------------------+  
|                   Compaction Pipeline                  |  
|  (Reduces, snips, and collapses the context window)    |  
\+--------------------------------------------------------+  
                           |  
                           v  
\+--------------------------------------------------------+  
|                    Core Agent Loop                     |  
|           (TypeScript state-machine cycle)             |  
\+--------------------------------------------------------+  
                           |  
                           v  
\+--------------------------------------------------------+  
|                  Safety / Action Layer                 |  
| (Evaluates permission modes and sandboxing rules)      |  
\+--------------------------------------------------------+  
                           |  
      \+--------------------+--------------------+  
      |                                         |  
      v                                         v  
                          
\- Shell Commands                         \- Aborted Session  
\- File Write / Edit                      \- Re-prompt Requested  
\- Web Fetch / Search                       
      |  
      v  
\+--------------------------------------------------------+  
|                    Execution Loop                      |  
| (Runs command, parses output, returns state to core)   |  
\+--------------------------------------------------------+

### **Autocomplete versus Agentic Paradigms**

| Feature | Autocomplete Systems | Agentic Systems (Claude Code) |
| :---- | :---- | :---- |
| **Operational Scope** | Line or function-level suggestion 1 | Full codebase architecture and project-level execution 1 |
| **Planning Capability** | None; relies on active human intervention | Autonomous multi-file planning and sequential execution 1 |
| **Verification Loop** | No integration with test suites or local runtimes | Active testing, error-log parsing, and automatic debugging 1 |
| **Tool Interaction** | Unable to invoke external interfaces or operating systems | Native integration with compilers, Git, shells, and web fetchers 1 |
| **Verification Context** | Restricted to open files or adjacent workspace buffers | Dynamically loaded directory context and custom instruction sets 2 |

### **The Core Agent Loop and Context Pipeline**

The system runs a state-machine loop written in TypeScript.3 When a task is submitted, the engine executes a continuous cycle 3:

1. **Context Assembly**: The system dynamically gathers workspace context, including active files, file paths, global memory files, and Git state.4  
2. **Compaction Processing**: To prevent memory limitations, the context passes through a five-layer compaction pipeline containing budget reduction, code snipping, micro-compaction, context collapsing, and automatic compaction.3  
3. **Model Querying**: The model receives the compacted context and determines whether to output raw text or call an active tool.3  
4. **Tool Verification**: The runtime checks the requested tool call against the active permission rules and local sandbox filters.3  
5. **Execution**: The local terminal environment executes the approved action and returns the output to the state database to guide the next phase of work.3

### **Concept Analogy for New Developers**

To understand the difference between autocomplete and an agentic system, consider the analogy of building a house.  
Autocomplete is like a smart power tool. When an operator holds a nail against a wooden plank, the tool suggests the next action by driving the nail in. However, the operator must still select the wood, design the blueprint, measure the alignment, and verify that the wall is structurally sound.  
An agentic system is like a master builder. The developer provides a blueprint or describes the final room in plain language. The system plans the construction steps, gathers the lumber, cuts the boards to size, assembles the frame, verifies the alignment, and checks for structural issues. If a joint fails a safety test, the system rebuilds that section until it meets safety codes. The developer retains overall control, reviewing and signing off on the completed work.1

## **Installation, Deployment, and Core Interfaces**

### **Platform Prerequisites and Environmental Adjustments**

Claude Code runs across multiple operating systems, requiring specific configurations depending on the underlying environment.7

| Platform | Recommended Operating System | Required Hardware / Dependencies | Default Shell | Sandboxing Integration |
| :---- | :---- | :---- | :---- | :---- |
| **macOS** | macOS 13.0 or higher 7 | Minimum 4 GB RAM; x64 or ARM64 processor 7 | Zsh or Bash 7 | Native Seatbelt sandboxing profile 6 |
| **Linux** | Ubuntu 20.04+, Debian 10+ 7 | 4 GB RAM; ripgrep, libgcc, and libstdc++ (Alpine) 7 | Bash or Zsh 7 | Bubblewrap (bwrap) container isolation 3 |
| **Windows WSL** | Windows 10 (Build 19041+) 8 | WSL 2 with Ubuntu distribution 8 | Bash (within WSL container) 8 | Sandbox supported within the WSL 2 system 7 |
| **Native Windows** | Windows 10 (Build 1809+) 7 | Git for Windows installed for shell access 5 | PowerShell or CMD (Git Bash recommended) 5 | Sandboxing not supported natively on Windows 6 |

#### **Optimizing the Windows Subsystem for Linux (WSL 2\)**

Running development tools directly within native Windows environments can sometimes lead to file path issues and slower file access.8 Developing within WSL 2 helps prevent these conflicts by running development processes inside a lightweight Linux virtual machine.8  
For the best performance, the project directories should be stored entirely within the Linux file system (such as \~/code-project) rather than accessing mounted Windows drives (such as /mnt/c/Users/).8 To isolate this environment from native Windows system paths, developers should add a minimal configuration file 8:

1. Open /etc/wsl.conf using a terminal text editor: sudo nano /etc/wsl.conf.8  
2. Add the following lines to disable Windows path appending 8:  
   Ini, TOML  
   \[interop\]  
   appendWindowsPath \= false

3. Restart WSL from a Windows PowerShell terminal to apply the changes 8:  
   PowerShell  
   wsl \-\-shutdown

### **Installation Pathways**

Developers can install the system through several different package managers.5

\+---------------------------------------------------------------------------------+  
|                                Installation Options                             |  
\+---------------------------------------------------------------------------------+  
         |                           |                            |  
         v                           v                            v  
             \[Package Managers\]             \[Node Ecosystem\]  
\- macOS/Linux Bash           \- Homebrew Cask                \- Global npm installation  
\- Windows PowerShell         \- WinGet package                 
\- Windows Command Prompt     \- Apt / Dnf / Apk (Linux)      

#### **Option 1: Native Installation Scripts (Recommended)**

Native scripts automatically download the correct binary for the operating system and configure background updates.5

* **macOS, Linux, and WSL 2**:  
  Bash  
  curl \-fsSL https://claude.ai/install.sh | bash

* **Windows PowerShell**:  
  PowerShell  
  irm https://claude.ai/install.ps1 | iex

* **Windows Command Prompt (CMD)**:  
  DOS  
  curl \-fsSL https://claude.ai/install.cmd \-o install.cmd && install.cmd && del install.cmd

#### **Option 2: Homebrew (macOS and Linux)**

Homebrew is a widely used package manager for macOS and Linux that simplifies software installation and updates. Developers can choose to install either the stable release or the latest updates.5

* **Stable Release Channel**:  
  Bash  
  brew install \--cask claude-code

* **Latest Updates Channel**:  
  Bash  
  brew install \--cask claude-code@latest

#### **Option 3: Windows Package Manager (WinGet)**

WinGet is the native command-line installer built into modern Windows systems. To install Claude Code via WinGet, run 5:

DOS  
winget install Anthropic.ClaudeCode

#### **Option 4: NPM (JavaScript Runtime Environment)**

NPM is the default package manager for the Node.js runtime, making it a cross-platform option for systems that already have Node installed.5 To install the package globally, run 5:

Bash  
npm install \-g @anthropic-ai/claude-code

### **Installation Analogy for New Developers**

To understand package installation options, consider how mobile phone applications are distributed.  
Using the native installation script is like configuring your phone to download an app directly from the developer, allowing it to apply automatic background updates.5  
Installing via Homebrew, WinGet, or NPM is like downloading an app from a third-party application store. It centralizes your packages, but you must manually run update commands (e.g., brew upgrade or winget upgrade) to get the latest features and security fixes.5

### **Operational Interfaces and Deployment Modes**

Claude Code can be accessed across several development interfaces, ensuring it fits into existing workflows.2

| Operational Interface | Sandbox Environment | Input Surface | Visual Review Mechanisms | Target Use Cases |
| :---- | :---- | :---- | :---- | :---- |
| **Command Line (CLI)** | Local process sandbox 6 | Terminal window input 5 | Terminal-rendered diff patches 11 | Fast terminal workflows, automated scripting, and piping processes 2 |
| **VS Code Extension** | Local process sandbox 6 | Integrated IDE sidebar panel 13 | Interactive visual diff overlays 10 | Full IDE integration with live code review and editing 13 |
| **JetBrains Plugin** | Local process sandbox 6 | Integrated tool window 10 | Editor refactoring panels 10 | Direct integration with JetBrains IDEs 10 |
| **Desktop App** | Local process sandbox 6 | Dedicated visual application 10 | Multi-project workspace panel 10 | Standalone project management and visual execution 10 |
| **Web Interface** | Isolated cloud container 10 | Web browser console 10 | Web-based text views 10 | Offloaded analysis, testing on cloud sandboxes, and quick sharing 2 |

### **Operational Analogy for Interfaces**

Accessing Claude Code through different interfaces is like managing an email account.  
An email inbox can be accessed through a terminal program (fast, text-only, ideal for scripting), a visual desktop app, a web browser, or directly inside your code editor. While the interface and display elements change, they all connect to the same core system, allowing you to read, write, and manage your messages.2

## **Command Line Interface and Customization Frameworks**

### **Initial Authentication and Workspace Setup**

Before launching your first session, you must authenticate your terminal with your account.5

\[Local CLI: "claude"\]   
       |  
       v

       |  
  \+----+----+  
  |         |  
  v         v  
   
(Browser-based login)          (Pre-paid credits config)  
  |         |  
  \+----+----+  
       |  
       v

(Saves auth tokens locally for subsequent sessions)

1. Open your system terminal.5  
2. Navigate to your active project directory 5:  
   Bash  
   cd \~/projects/my-app

3. Start the application by running 5:  
   Bash  
   claude

4. The system will detect if you are authenticated. If not, it will display a login prompt with a unique link to open in your browser.5 Follow the instructions to log in to your Claude Pro, Max, or Enterprise subscription, or your Console Developer API account.5  
5. Once authenticated, your login tokens are securely stored locally, meaning you only need to run this initial setup once.5

### **Operational CLI Commands**

The command line supports several primary execution modes to launch sessions, run automated tasks, and manage data.11

| CLI Command | Execution Mode | Behavior | Use Case Example |
| :---- | :---- | :---- | :---- |
| claude | Interactive | Starts an interactive workspace session 11 | claude |
| claude "query" | Interactive | Opens an interactive session seeded with an initial instruction 11 | claude "find why the dev build is failing" |
| claude \-p "query" | Non-Interactive | Evaluates the query, outputs the response to the terminal, and exits 11 | claude \-p "explain the entry-point file" |
| cat \<file\> | claude \-p "query" | Non-Interactive | Processes text piped through standard input and exits 11 | cat package.json | claude \-p "list dependencies" |
| claude \-c | Interactive | Resumes the most recent conversation in the directory 11 | claude \-c |
| claude \-r "\<session\>" | Interactive | Resumes a specific conversation by its session ID or name 11 | claude \-r "payment-bug" |
| claude update | Maintenance | Checks for and installs the latest stable release 11 | claude update |
| claude auth status | System | Checks active authentication state and outputs JSON 11 | claude auth status |
| claude project purge | Cleanup | Deletes local history, logs, and database entries for a project 11 | claude project purge \~/my-project |

### **CLI Commands Analogy for New Developers**

Consider running CLI commands like starting a conversation with an assistant.  
Running claude is like starting a live phone call where you stay on the line to talk and work through a task together in real time.5  
Running claude \-p "query" is like sending a quick text message.5 The assistant reads your question, replies with a single message, and hangs up immediately.5

### **Session Control Shortcuts and Slash Commands**

Once inside an interactive session, you can use specialized slash commands and keyboard shortcuts to manage your workspace.12

#### **Interactive Keyboard Shortcuts**

* **Shift \+ Tab**: Cycles the active permission mode (Default → Accept Edits → Plan) to control tool approvals.12  
* **Esc**: Instantly interrupts the agent's output, letting you type a new prompt immediately.12  
* **Esc, Esc**: Opens the local Git and conversation checkpoint menu to roll back changes.12  
* **Ctrl \+ C**: Cancels active inputs, or exits the terminal session when pressed on an empty prompt.12  
* **Ctrl \+ R**: Searches backward through your session's command history.12  
* **@ \+ path**: References a file or directory in your prompt, supporting autocomplete.12

#### **Slash Commands for Workspace Control**

* **/help**: Lists all active commands and custom skills.12  
* **/init**: Analyzes the directory and builds an initial, project-specific configuration file (CLAUDE.md).12  
* **/clear**: Wipes the active conversation history to start fresh while keeping the project's memory intact.12  
* **/compact**: Condenses the conversation history to free up space in the context window.12  
* **/btw**: Opens a dismissible window to ask a quick question without adding it to the main conversation.12  
* **/rewind**: Rolls back the directory and chat history to an earlier checkpoint in the session.12  
* **/model**: Switches the active AI model mid-session.12  
* **/cost**: Shows the token usage and cost for the current session.12  
* **/permissions**: Configures which tools require manual developer approval.12  
* **/plan**: Puts the session into read-only Plan Mode to design an approach before editing files.12  
* **/doctor**: Runs diagnostic checks on your environment, permissions, and network connections.12

### **Slash Commands Analogy for New Developers**

Using keyboard shortcuts and slash commands is like using quick keys on a calculator or shortcuts on your phone.  
Typing a slash / is like opening an action menu to adjust settings or clean your workspace.12  
Pressing Esc, Esc is like an "un-do" shortcut, letting you instantly reverse mistakes and revert both your code and conversation to a safe, earlier point.12

## **Project Context Engineering and Onboarding Frameworks**

### **The Core Role of CLAUDE.md**

A major challenge for coding agents is maintaining project context across independent sessions. Claude Code addresses this using a special markdown file named CLAUDE.md, which is stored in the project's root directory.2 The agent reads this file at the start of every session to align with the project's unique development environment, conventions, and requirements.2

          |  
          v

          |  
    \+-----+-----+  
    |           |  
    v           v  
        
(Loads environment,      (Prompts operator to run "/init"  
 rules, and style files)  to bootstrap project template)

#### **Initializing CLAUDE.md**

To create this file, run the /init command in your terminal.15 This initiates a scan of your project directory to detect dependencies, testing libraries, and style rules, automatically compiling them into a starter CLAUDE.md file.15

#### **Formatting Guidelines and Best Practices**

To optimize performance, your CLAUDE.md file should be kept short and concise, ideally under 200 lines.15 If an instruction is self-evident or standard for the language, it should be excluded.15  
The "Mistake Rule" states that if the agent repeatedly makes the same mistake, the CLAUDE.md file is likely too long, causing the relevant instruction to get lost in the context.15 Every line must be evaluated carefully: if removing a rule would not cause the agent to make mistakes, that rule should be removed.15

| Recommended to Include in CLAUDE.md | Recommended to Exclude from CLAUDE.md |
| :---- | :---- |
| Build and test commands 15 | General programming standards 15 |
| Project-specific directory layouts 15 | Full file listings or directory structures 16 |
| Custom code style preferences 15 | Standard API guides or long tutorials 15 |
| Environment setup details and configurations 15 | Highly volatile credentials or variables 15 |
| Branch naming patterns and pull request structures 15 | Obvious instructions such as "write clean code" 15 |

#### **Code Example: Minimal CLAUDE.md**

# **MyNode Backend Service**

## **Development Commands**

* Run build process: npm run build  
* Run test suites: npm test  
* Run specific tests: npm test \-- \--testPathPattern=users  
* Run linter checks: npm run lint

## **Directory Structure**

* src/controllers/ — HTTP route controllers  
* src/models/ — Data models (Sequelize)  
* tests/ — Testing modules mirroring the src/ directory

## **Development Style Guidelines**

* Use TypeScript strict mode; explicitly type variables and avoid any  
* All JSON API responses must use kebab-case formatting  
* Import packages using ES module imports (import/export), not CommonJS require  
* Use the built-in system logger; do not use raw console.log statements

### **Context Onboarding Analogy for New Developers**

Think of CLAUDE.md like an onboarding handbook for a new developer joining your team.  
Instead of sitting next to them and explaining how to run tests, where to save files, and what formatting rules to follow, you hand them a brief, one-page guide containing the essential commands and conventions of the house. This allows them to start working immediately while adhering to your team's standards.

### **System Extensibility: Skills, Hooks, and Auto-Memory**

The agentic runtime can be customized and extended using three primary tools 3:

#### **System Skills**

Skills are reusable packages of instructions and tools designed to guide the agent through specific workflows, such as reviewing pull requests or generating deployment reports.12 Custom skills are defined as markdown files inside .claude/skills/\<name\>/SKILL.md.12

## **name: verify-api-standards description: Validates REST API routes against organizational design rules**

# **Verifying REST API Standards**

When validating API routes, ensure the following rules are met:

1. All URL paths must use kebab-case formatting.  
2. All JSON properties must use camelCase formatting.  
3. Every list endpoint must include pagination by default.  
4. APIs must include versioning directly in the URL path (e.g., /v1/, /v2/).

#### **Event-Driven Hooks**

Hooks are shell commands configured in settings.json that run automatically before or after specific actions.2 For example, you can set a hook to automatically run a code formatter (such as Prettier) after a file modification, or run a linter check before a Git commit is saved.2

* **PreToolUse**: Runs before a tool executes, allowing the system to inspect or block the action.3  
* **PostToolUse**: Runs immediately after a tool executes, useful for running validation checks.3  
* **UserPromptSubmit**: Runs immediately after a user submits a prompt.17  
* **Notification**: Triggers when the agent sends a notification.17  
* **Stop**: Triggers when a session ends.3

#### **Persistent Auto-Memory**

Claude Code automatically learns and maintains a local memory file (MEMORY.md) to store preferences, build patterns, and resolution steps across sessions without manual developer input.2 To optimize performance, the system automatically loads the first 200 lines (or 25KB) of this file at the start of every session.4

## **Subagents, Session Orchestration, and System Security**

### **Subagents and Isolated Context Windows**

As development sessions grow longer, the conversation history can consume significant space in the context window.15 To save space, Claude Code supports creating subagents—isolated auxiliary instances dispatched to handle specific tasks.3

             |  
             v

             |  
             v  
 \---\>  
                                               |  
                                               v  
                                  (Reads and parses files)  
                                               |  
                                               v  
 \<---------

Subagents run in their own isolated, separate context windows, keeping your main conversation clean and focused on implementation.3 To delegate a task to a subagent, use a prompt such as 15:  
*"Use subagents to investigate how our authentication system handles token refresh, and whether we have any existing OAuth utilities I should reuse."*  
The subagent will explore the codebase, read the necessary files, and report back with a concise summary of its findings, protecting your main session from becoming cluttered with thousands of lines of file reads.15

### **CLI Daemon and Session Management**

Developers can monitor and coordinate active background processes using the CLI daemon tools.11

| daemon command | Operation | Description | Practical Example |
| :---- | :---- | :---- | :---- |
| claude agents | Process Review | Lists active background agent sessions as JSON or text 11 | claude agents \--json |
| claude attach \<id\> | Interaction | Connects the current terminal session to a running background agent 11 | claude attach a1b2c3d4 |
| claude logs \<id\> | Diagnostics | Prints the execution history and console logs of a background session 11 | claude logs a1b2c3d4 |
| claude stop \<id\> | Termination | Safely stops a running background session 11 | claude stop a1b2c3d4 |
| claude respawn \<id\> | State Recovery | Restarts a background session while keeping its conversation history intact 11 | claude respawn a1b2c3d4 |

### **Checkpoint Isolation and the Rewind System**

Every prompt submitted automatically saves a local checkpoint, taking a snapshot of both the conversation history and your codebase.12 If an implementation approach fails, you can open the rewind menu by double-tapping the Esc key (Esc, Esc) or running /rewind.12 This allows you to restore your files, conversation history, or both back to any earlier checkpoint.12

#### **Checkpoint Analogy for New Developers**

Think of sessions, subagents, and checkpoints like playing an adventure video game.  
Sessions and checkpoints are like "save states." Before starting a difficult boss fight or attempting a risky modification, the system automatically saves your progress. If your character dies or your changes break the build, you can reload that exact save state to restore your game back to health.12  
Spawning a subagent is like sending a companion to complete a quest in another room. While you focus on coding, they run the errand, gather the information, and return with a summary, keeping your main screen clean and focused.15

### **Permission Controls and Platform Sandboxing**

To ensure security, Claude Code uses a granular permission system that controls which actions the agent can perform automatically and which require manual developer confirmation.6

| Permission Mode | File Reading | File Writing | Shell execution | Primary Use Case |
| :---- | :---- | :---- | :---- | :---- |
| **default** | Allowed automatically 6 | Prompts for confirmation 6 | Prompts for confirmation 6 | Standard daily development 6 |
| **acceptEdits** | Allowed automatically 6 | Allowed automatically 6 | Prompts for confirmation 6 | Intensive refactoring sessions 6 |
| **plan** | Allowed automatically 6 | Blocked 6 | Blocked 6 | Design reviews and analysis 6 |
| **auto** | Allowed automatically 6 | Classifier decides safety 6 | Classifier decides safety 6 | Automated team workflows 6 |
| **dontAsk** | Allowed automatically 6 | Pre-approved actions only | Pre-approved actions only | Automated background scripts 6 |
| **bypassPermissions** | Allowed automatically 6 | Allowed automatically 6 | Allowed automatically 6 | CI/CD pipelines only 6 |

#### **The Auto Mode Classifier and Safety Integrity**

In auto mode, permissions are managed by an integrated machine-learning classifier (the YOLO classifier).3 This classifier evaluates safety across a two-stage process: a fast-filter check followed by a chain-of-thought analysis to determine if an action matches user intent and remains safe.3  
The system uses more than twenty block rules to prevent dangerous actions, focusing on four primary categories:

* **Destroy or Exfiltrate**: Blocks force-pushing over Git history, deleting cloud storage, or sending internal data to untrusted external URLs.18  
* **Degrade Security Posture**: Blocks disabling logs, modifying the agent's permissions, or installing background persistence tools (like SSH keys or cronjobs).18  
* **Cross Trust Boundaries**: Blocks execution of untrusted scripts cloned from external sources or scanning credential stores for API keys.18  
* **Bypass Review**: Blocks pushing code directly to protected primary branches or running production deployments without human review.18

#### **Platform Sandboxing**

To prevent malicious shell execution, Claude Code automatically isolates subprocesses using platform-native sandboxing.6 On macOS, the system integrates with Apple's native **Seatbelt** kernel-level sandboxing framework.6 On Linux environments, it relies on **bubblewrap** (bwrap) to enforce namespace isolation.3  
This sandboxing runs locally, restricting process access to the local filesystem, network, and child processes with a latency overhead of less than 15 milliseconds per command execution.6

## **Operational Scenarios and Deployment Guide**

### **Scenario 1: Initial System Setup on Windows WSL 2**

This guide walks through setting up a clean development environment on Windows using WSL 2 and Ubuntu.8

#### **Step 1: Clean System Environment Paths**

Ensure no conflicting path variables from other IDEs or tools exist in your active shell.

1. Press Windows \+ R, type sysdm.cpl, and press Enter to open System Properties.8  
2. Click the **Environment Variables** button.8  
3. Check both the User and System "Path" variables to remove conflicting entries pointing to external compilers or editors on non-primary drives.8

#### **Step 2: Install and Configure WSL 2 with Ubuntu**

Open a Windows PowerShell terminal as Administrator and execute 8:

PowerShell  
\# Set WSL 2 as default version  
wsl \-\-set-default-version 2

\# Install the Ubuntu distribution  
wsl \-\-install \-d Ubuntu

Once the installation completes, restart your computer, complete the Ubuntu user setup prompts, and update the system packages 8:

Bash  
sudo apt update && sudo apt upgrade \-y

#### **Step 3: Configure Node.js and NPM within Ubuntu**

Within your WSL terminal, run the following commands to install Node.js and configure global npm permissions without requiring root privileges 8:

Bash  
\# Install Node.js and NPM  
sudo apt install \-y nodejs npm

\# Configure npm global directory to avoid root permission issues  
mkdir \~/.npm-global  
npm config set prefix '\~/.npm-global'

\# Add path mapping to profile configuration  
echo 'export PATH=\~/.npm-global/bin:$PATH' \>\> \~/.bashrc  
source \~/.bashrc

#### **Step 4: Install and Authenticate Claude Code**

Run the NPM installer and launch your first session 5:

Bash  
\# Install package globally  
npm install \-g @anthropic-ai/claude-code

\# Launch and complete authentication prompts  
cd \~/my-project  
claude

### **Scenario 2: Standardizing Onboarding with CLAUDE.md**

This scenario guides a team lead through setting up a standardized onboarding configuration for a new project.

#### **Step 1: Initialize CLAUDE.md**

1. Open your terminal in the root directory of your project.5  
2. Run the initialization command 15:  
   Bash  
   claude  
   \# Once inside the interactive session, run:  
   /init

3. The system will analyze your project files and generate a baseline CLAUDE.md.15

#### **Step 2: Customize Style Rules and Style Patterns**

Open the generated CLAUDE.md in your editor and add specific style guidelines and commands unique to your project 15:

# **MyReact App Onboarding Guide**

## **Critical Commands**

* Local Development Server: npm run dev  
* Execute Tests: npm test  
* Linter Check: npm run lint

## **Project Structure**

* src/components/ — Reusable visual UI components  
* src/hooks/ — Custom React hooks  
* src/context/ — Global state management files

## **Guidelines and Styles**

* Use functional components and custom React hooks instead of class components  
* Use CSS modules for component-specific styling  
* Always write a unit test inside tests/ for any new utility function

#### **Step 3: Check into Source Control**

Save and commit the CLAUDE.md file to your Git repository 15:

Bash  
git add CLAUDE.md  
git commit \-m "docs: add standard CLAUDE.md onboarding configuration"  
git push origin main

When new developers clone the repository and run claude, the agent will automatically read this file, ensuring they immediately follow the correct build commands and code style rules.2

### **Scenario 3: Investigating Log Failures using Subagents**

This scenario demonstrates how to use a subagent to search a large codebase for a bug, protecting your main session context from becoming cluttered.15

#### **Step 1: Launch Interactive Session**

Start a session inside your project directory 5:

Bash  
cd \~/projects/api-service  
claude

#### **Step 2: Delegate Log Search to a Subagent**

Instead of asking the main agent to search the codebase directly, delegate the search to a subagent to keep your active context clean 15: Please use a subagent to research our server logs directory and trace why we are seeing connection timeouts in src/db/connection.ts.

#### **Step 3: Analyze Subagent Findings**

The main agent will spawn a subagent to read the relevant log files, trace dependencies, and analyze the database connection logic.3 Once complete, the subagent will exit and report a concise summary back to your main terminal window 3: The subagent has completed its investigation. It identified a connection timeout occurring at connection.ts:line 42\. The database host variable is defaulting to localhost because the DB\_HOST environment variable is missing from the active profile.

#### **Step 4: Implement and Verify the Fix**

Now that you have identified the issue, ask the agent to apply the fix and verify it works by running your test suites 2: Please create a sample environment file containing DB\_HOST, and run our connection tests to verify the fix works. Once you approve the proposed changes, the agent will update the configuration, run the tests, and verify that the issue has been resolved.1