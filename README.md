Angels and Mortals Bot built for RVRC Chelonia House!!!

## Setup application

0. Install nodejs, npm
1. Create a new bot with BotFather. Set up profile pic, info, about,...
2. Create a new file ```tokens.js``` and add the token from BotFather.
3. Set up Firebase account and create a project. Configure Firebase Admin SDK and generate a new key for service account.
4. Move the service account file into your folder. Change the path to the file in ```app.js```.
5. Set up Dialogflow API. Import the following file: https://drive.google.com/file/d/1q7vxwX7DeXM8gQPI6fzDehXrpuOU1voV/view?usp=sharing
6. *(Optional)* Personally I deployed this to Heroku with the Dockerfile, but you can just run locally as shown below. (The downside is that you will have to run 24/7, unless you let people know when the bot would be down.)

**Reminder**: Try not to enable biling unless necessary, and if you do, there should be a free period so just remember to disable biling + close project after the Angels & Mortals Event.

## Run application
1. Run ```$env:GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceaccountfile.json"```.
2. Run ```npm install```.
3. Run ```node app.js```.
