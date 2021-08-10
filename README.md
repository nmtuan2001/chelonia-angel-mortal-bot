Angels and Mortals Bot built for RVRC Chelonia House!!!

## Setup application

0. Install nodejs, npm
1. Create a new bot with BotFather.
2. Create a new file ```tokens.js``` and add the token from BotFather.
3. Set up firebase account and create a project. Configure Firebase Admin SDK and generate a new key for service account.
4. Move the file into your folder. Change the service account in ```app.js```.
5. Set up Dialogflow API. Import the following file: https://drive.google.com/file/d/1q7vxwX7DeXM8gQPI6fzDehXrpuOU1voV/view?usp=sharing

## Run application
1. Run ```$env:GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceaccountfile.json"```.
2. Run ```npm install```.
3. Run ```node app.js```.
