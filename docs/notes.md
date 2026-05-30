Dashboard:
- Could use more charts/graphs, deep dive into insights. Should be very visually appealing 

Expenses: 
- Overall okay with the Add
- Would be good to have the option for recuring or non recurring option to differentiate. E.G. if I know I have an expense coming up (vacation, large single purchase, etc), that type of deal. 
- No current section for me to add budgets anywhere in the app, not sure if that is here or its own thing. 

Income: 
- Overall okay, I would like this to be enhanced a bit with the concept of putting income types. For instance, W2 income (from my job). It would be cool if I could put in my yearly salary, or a paystub, and have it break that down for me in terms of what I pay for taxes. Having the ability to build some tax features into this would be nice (high level tax features of course), but seeing what I spend on insurance, 401k contribution, etc (and being able to cross check those numbers on the investments tab for 401k for instance)
- Not sure if the Plaid integration will capture this but being able to define actual accounts that are reused in the app so that I dont have to type them in multiple places 

Investments: 
- Seems clunky when going to add. Am I adding an account? An individual investment? An account with multiple investments? A portfolio? etc. This one should be revamped heavily and talked through as some will be manual and some might be from an API 

Debt: 
- I like having long term and short term split. 0% shouldn't be lumped into short term, though. 
- There should be a category for the debt that lines up with the essential or wants, along with a type (credit card, car loan, mortgage, etc etc)

History: 
- unsure of the intention here, why this was implemented this way. Why should i need to manually record a month? Data should be a live snapshot I guess? maybe we have to chat about that? 

Settings: 
- Should be user settings for sure, we should expose a lot of flexibility here. 
- Admin settings should include app settings where applicable and those safe settings should be stored in DB. 
- Not sure if we can work to configure external integrations via the admin UI and still store them, if not its fine for them to come from vault. 


Import: 
- Likely should be a bit more flexible on this, we should be able to import from various institutions? 

Plaid: 
- How does this work? 

Backend
- Need to get all keys stored in my vault at vault.opsguy.io and loaded into the env at runtime 

CI: 
- Need CI that will build and publish an image on GHCR.io

Tests: 
- Need tested code
- Unit, Regression, and UI (playwright)

Security:
- Sec scanning 
- Dependabot
- Pen testing of some kind
- Data storage and ensuring we are not risking any leaking of data anywhere in the app. 
