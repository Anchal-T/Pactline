The Dawn of Superintelligence | Kaya AI Grand Challenge
The Dawn of Superintelligence where innovation meets the grounds of construction

About The Grand Challenge: The Dawn of Superintelligence
Kaya AI is the #1 AI-powered Supply Chain Platform in construction, recognized by BuiltWorlds as a Top AI-Driven AEC Solution for 2026. Our India Hackathon is back for Edition 2, and it marks the dawn of a new era: superintelligence for construction.

Buying equipment and services for a large project is slow and error-prone. Procurement teams compare dozens of bids by hand, chase suppliers for delivery dates, and check hundreds of product documents against the project specs. One missed exclusion in a bid or one late switchboard can cost weeks of delay and millions of dollars, especially on data center builds where timelines are tight.

At the center of Kaya is Amber, Kaya's procurement agent. General contractors and data center owners use Amber across supply chain, procurement and last-mile delivery. Amber coordinates the work and hands each job to the agent best suited for it.

In The Grand Challenge, you build one of those agents. Not a standalone app: an agent Amber can rely on. And not a feature: a product, with a clear job, a clear user, and an output someone on a job site would act on tomorrow.

The top 10 teams don't just pitch. In Round 2 they take their agents further, closer to how Amber works, and demo them live at the finale in Mumbai. The winners then head to The Chainsmokers live in Mumbai on December 18.

This edition is open to students from IITs and colleges across India and to working professionals, in two divisions. Both divisions get the same tracks and challenges, are ranked separately, and each has its own $1,500 prize.

Requirements
What to Build
Build an agent for construction in one of three tracks. Each challenge starts from a real problem on a construction or data center job, with the input your agent takes and the output it should give back. Your team picks one challenge.

Build with your own tools and data. Use public sources, or sample data you prepare yourselves, and explain how you got it.

Mentors from the Kaya team hold office hours during Round 1 to answer questions about the problems.

How the three tracks fit together. Amber needs three things to become superintelligence for construction:

Track 01, AGI (breadth): one general agent that can take any job and carry it through to the end
Track 02, Contextual Intelligence (awareness): knowing what is happening on the physical site: what was said, what is there, and where things are
Track 03, Vertical Agents (depth): specialists that do one job better than anyone, which Amber calls on
Which division? Your division depends on who is on your team, not on the challenge you pick. Students enter the Students division and working professionals enter the Professionals division. Both divisions work on the same tracks and challenges, are judged on the same criteria, and are ranked separately, with a $1,500 prize for the winning team in each.

 

🧠 Track 01: Amber General Intelligence (AGI)

Work on a construction or data center project rarely happens in one step. It’s a long chain of tasks that runs for weeks or months, across many people, documents and systems, and things change constantly along the way.

Amber General Intelligence runs this long-horizon work. It keeps the whole job in view and calls on vertical agents, specialists that are world class at one job, only when a step needs them.

Your challenge: build Amber Computer, a general-purpose agent for construction. Think Devin, but for construction. Give it a job in plain English, the way you’d hand it to a colleague. It plans the steps, pulls context from any source, uses whatever tools the job needs, and carries the work through to the end, over many steps and many days. It isn’t built for one task: the same agent should take on jobs it was never built for.

Understand how construction work really unfolds, find where it breaks down, and decide what your agent will do. You can build your own vertical agents, use mock ones, or model them on the Vertical Agents track.

Some directions to explore

Handling the unexpected job. How does your agent take on a kind of job it was never built for?
Finding the right context. How does it gather what matters from scattered, messy sources, and notice what’s missing?
Planning and adapting. How does it plan work that takes weeks, and adjust as things change?
Working with specialists. How does it know which expertise a step needs, and what to do when specialists are wrong or disagree?
Staying with the job. How does it keep track over days, recover from failures, and pick up after a restart without repeating itself?
Knowing when to ask. How does it decide what to do alone and what needs a person’s sign-off?
What we’re looking for: an agent that handles more than one kind of job, grounded in real construction work, with good judgment and a clear trail a project manager can follow.

Extra rules for this track (the agent takes actions, not just answers):

Asks a human before anything that can’t be undone
Logs every action it takes and every specialist it calls
Keeps its own record of where each job stands, so it can pick up again after a restart
1.1 Amber Computer: any job, end to end

Most of a project team’s work isn’t one big decision. It is a chain of small actions across email, documents, spreadsheets and project software. A good colleague can take “sort out the late submittals” and just do it, working out the steps along the way. Software can’t, so the person ends up doing every step themselves.

Input: a job in plain English, such as “Chase every submittal more than a week late, update the log as vendors reply, and tell me which ones put the schedule at risk”, plus access to the project’s mailbox, files, schedule and tools.
Output: the job done: emails sent (with approval where needed), records updated, and a short report back, plus a log of every step.
Good looks like: an agent you could hand a new kind of job without rebuilding it. It works out the steps itself, asks before anything that can’t be undone, and shows where every decision came from.
1.2 The conductor: orchestrating specialist agents

Some jobs are too big for one agent. Buying a switchgear package means finding vendors, comparing their bids, checking the submittal against the spec and watching the delivery: four different kinds of expertise. Amber’s job is to break the work down, hand each piece to the right specialist, check what comes back, and combine it into one result. Get the hand-offs wrong and the experts’ work is wasted.

Input: a big goal, such as “Get the 480 V switchgear package for Project Alpha ordered by 2027-03-15 within budget X”, and a set of specialist agents it can call (your own, mock ones, or Track 03 style agents), each described by what it takes in and what it returns.
Output: the plan, which specialist handled each step, how their outputs were checked and combined, and the final result.
Good looks like: the right work goes to the right specialist, disagreements between specialists are caught instead of passed on, and a person can follow how the final result was reached.
1.3 Work that takes days, not minutes

Real construction jobs don’t finish in one sitting. A vendor replies three days later, an approver is on leave, a price changes after the quote, a tool fails halfway through. Most agents today forget everything when the chat ends. Amber has to hold a job open for weeks, wait, notice when something changes, and pick up where it left off.

Input: a multi-step job and a stream of events over simulated days: replies arriving late, dates slipping, documents missing, tool calls failing, and the agent being stopped and restarted.
Output: the updated plan and the actions taken at each point, plus the agent’s saved state.
Good looks like: it recovers from setbacks on its own where it can, never does the same thing twice (two emails to the same vendor, two orders), picks up correctly after a restart, and leaves a trail a project manager can follow.
What would it look like if Amber could take any job a project engineer does, and just do it?

 

📍 Track 02: Contextual Intelligence

Amber already knows a great deal about a project: every purchase order, every delivery, every schedule and every submittal. What it can't do is see the job site. The people on site can see everything, but they rarely have time to stop, look things up across half a dozen systems and connect the dots before they make a call.

A crew is about to install a chiller in a third-floor plant room. It is the right model, but it was meant for the fourth floor, and nobody notices until it is bolted in. A delivery is unloaded at the gate and signed for, and only later does someone find two items short against the order. A warehouse lead has to send material to site and can't find where it is stored. None of these are big decisions. They are hundreds of small checks a day, made from memory and phone calls, and every one that slips costs rework, delay or money.

There is no fixed problem statement for this track. The situations above are a starting point, not a list to pick from. Find out how a job site really runs, find the moments where people make calls without the context they need, and decide which one your team will solve and how. The best entries will probably be ideas we haven't thought of.

Some directions to explore:

Is this the right thing, in the right place? Matching what is in front of you with what was ordered, specified and drawn for that spot
What was decided? Decisions made out loud on site walks, calls and meetings that never reach the system
Where is it, and what is around it? Materials, deliveries, crews and equipment, and what is planned for a given spot
What should happen next? Turning what the site shows into an action someone can take right away
This is the successor to Edition 1's Physical AI track. Last time the focus was the physical signals. This time it is hardware plus software: joining what the site shows with what the systems know.

What you work with: a phone camera is enough. Smart glasses or other devices are welcome but not required. Use a sample project you put together yourselves (orders, delivery records, a schedule, drawings or a site plan, photos, recordings) or public datasets.

Extra rules for this track:

No tracking or recording of real people. Use synthetic voices, device IDs and driver IDs, and don't collect or infer the location or identity of real individuals
Show where every answer came from: the order line, drawing, record or moment in a recording
When the agent can't match something, it flags it rather than guessing
What would Amber know if it could see the site the way the people on it do?

 

🧩 Track 03: Vertical Agents (Amber sub-agents)

Some procurement jobs are hard enough to deserve a specialist. Comparing bids that each cover something different. Checking a supplier’s documents against the spec. Deciding whether a vendor is safe to trust with a critical job. Done by hand, these take days and still miss things.

How this differs from Track 01: Track 01 builds the generalist that runs long-horizon work. This track builds the specialists it calls on. Amber doesn’t need every specialist on every job, but when it calls one, that specialist has to be world class. Depth here, breadth there.

Your challenge: build a suite of specialist agents that procurement teams would actually use. Aim for a suite that’s as complete as you can make it, with every specialist in it built deep enough to be world class at its job. The specialists should work together as one product, with each agent’s output feeding the next. Think about what a procurement team would pay for, not just what makes a good demo.

The specialists below are a starting point. Cover as many as you can, combine them however makes sense, and add specialists we haven’t listed. Open to everyone: any team can build any specialist.

Specialists you could build

Bid leveling. Bids for the same package rarely cover the same things. A leveling agent lines them up on a common scope, catches hidden exclusions and conditions, and recommends an award with reasons an estimator would trust.
Schedule and delivery risk. Warning signs of late equipment are spread across the schedule and purchase orders. A risk agent finds the items that will really hold up the project, ranks them, and suggests what to do.
Spec and submittal compliance. Checking supplier documents against the spec line by line is tedious, and misses cause rework. A compliance agent marks what complies, deviates or is missing, citing both documents.
Product discovery. When a specified product is late or unavailable, teams need true equivalents fast. A discovery agent finds alternatives from other manufacturers and explains why each one matches or falls short.
Lead time prediction. Major equipment can take weeks or over a year to arrive. A prediction agent estimates realistic delivery ranges and explains what drives them.
Vendor and subcontractor discovery. Finding new suppliers often depends on someone’s contact list. A discovery agent widens the pool using public information, ranking real companies with sources.
Vendor pre-qualification. Before inviting a vendor to bid, teams check licensing, safety, finances and legal history. A pre-qualification agent builds an evidence-backed scorecard with a pass, flag or fail.
Private deployment. Many data center owners and government projects can’t send project data to a public cloud. Run your agents entirely inside a private environment, such as your own private cloud, a local server or a GPU workstation, using open-weight models served locally, so no data, prompts or outputs leave it. Show that they work fully offline, stay close in accuracy to the cloud version, respond quickly, and deploy with one command. Kaya doesn’t provide hardware or cloud credits, so use whatever setup you have and tell us what it is.
What every specialist must do

Amber has to be able to rely on your specialists without a person checking every answer. So each one should:

Be callable by another agent, for example as an MCP server or an API, and work on its own so Amber can use exactly the expertise a step needs.
Take structured input and return structured output, not only free text.
Show its sources for every answer: the document, page, row or website it came from.
Give a confidence score, and hand the decision to a person when it isn’t sure instead of guessing.
Never make things up. Invented vendors, products, model numbers or sources count heavily against you.
Contain no built-in answers. It should work on new inputs it has never seen.
Be easy to run, with a README and simple setup, and state which models it uses with a rough cost and response time per run.
Use shared data formats across your suite so one specialist’s output can feed another’s input cleanly.
Data

Use public sources and sample data you create yourselves, and cite where everything came from. Don’t use confidential client data. Explain how you built any dataset you rely on.

What we’re looking for

Specialists that get the answer right on problems they haven’t seen, with every finding traced to its source
A suite that covers as much of the procurement workflow as possible, without trading away depth: every specialist should be strong enough to rely on
Agents that hand off cleanly and add up to more than the sum of their parts
Something a procurement manager would use tomorrow
 

What Every Entry Must Do
Every entry, in every track, has to be something Amber could rely on. Judges look for this in both rounds.

Return structured output (for example JSON), not only free text, so another agent can use it
Be callable by another agent: run as an MCP server, so Amber can connect to it directly
Show its sources for every answer: the document, page, row, photo, recording or website it came from
Give a confidence score with each answer, and hand off to a human when it isn't sure instead of guessing
Never make things up. Invented vendors, products, model numbers or sources are heavily penalized
Be easy to run, with a README and simple setup steps
Name the AI models used, with a rough cost and response time per run
Go Deeper Than an API Call
The winning teams won't just wrap a chatbot around a prompt. The models are already the smartest in the room. What wins is how well you drive them:

Long-running plans and memory: agents that keep track across days, recover from failures and pick up after a restart
Tool use: agents that act through real tool interfaces, with every step logged
Multimodal understanding: speech, photos and video from the job site, turned into structured records
Document understanding: reading specs, drawings, bids, schedules and data sheets, beyond basic OCR
Forecasting: honest ranges, not single guesses, for lead times and arrival times
Linking records: matching the same item across systems that were never designed to talk to each other
Tip: read recent research papers and explore open-source models. The biggest advantage often comes from a technique nobody else thought to apply.

What to Submit (end of Round 1, by Sunday, December 6, 2026)
Your track and challenge (for Track 02, the problem your team chose), and your division (Student or Professional)
Code repository link, with a README explaining setup and how to run the agent
Demo video of up to 5 minutes showing the agent solving a realistic example from start to finish
Pitch deck of 8 to 10 slides
Names and affiliations (college or company) of all team members