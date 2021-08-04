/*
A chatbot by lumos309
 */

'use strict';

const cookies = require("browser-cookies");
const request = require("request-promise");

const telegramBot = require('node-telegram-bot-api');
const express = require('express');
const structjson = require('./structjson.js'); // for error handling in context parsing
const constants = require('./constants.js'); // import pre-defined constants
const tokens = require("./tokens.js"); // import Telegram bot API tokens
const functions = require('./functions.js'); // import helper functions
const admin = require("firebase-admin"); // firebase admin sdk
const serviceAccount = require("./chelonia-angel-mortal-db-firebase-adminsdk-qjrop-43cee9a69f.json"); // firebase credentials
const dialogflow = require('dialogflow');
const uuid = require('uuid');

const aboutMessage = constants.aboutMessage;
const helpMessage = constants.helpMessage;
const startMessage = constants.startMessage;
const extraMessage = constants.extraMessage;
const verifyAdminMessage = constants.verifyAdminMessage;
const pairingNotFoundMessage = constants.pairingNotFoundMessage;
const messageSentMessage = constants.messageSentMessage;
const accessAngelSuccessMessage = constants.accessAngelSuccessMessage;
const accessMortalSuccessMessage = constants.accessMortalSuccessMessage;
const adminPairingsRetrievedMessage = constants.adminPairingsRetrievedMessage;

const genderSelectKeyboard = constants.genderSelectKeyboard;
const houseSelectKeyboard = constants.houseSelectKeyboard;
const adminId = constants.adminId;
// const liveToken = tokens.liveToken;
// const testingToken = tokens.testingToken;
const rvrcAngelMortalToken = tokens.rvrcAngelMortalToken;
const CheloniaPassword = tokens.CheloniaPassword;
const AonyxPassword = tokens.AonyxPassword;
const shuffleArray = functions.shuffleArray;
const sleep = functions.sleep;

///* express routing setup *///
const app = express();

// cron job - ping every 2 mins to maintain instance
app.get('/', (req, res) => {
  res
    .status(200)
    .send('Hello, world!')
    .end();
});


// cron job - restart bot polling every 10 mins
// workaround? It dies randomly for no reason...
app.get('/restart', (req, res) => {
	/*
	bot = null;
	sleep(10000);
	bot = new telegramBot(token, {polling: true});
	*/
	
	bot.stopPolling();
	sleep(2000);
	bot.startPolling();
	//console.log("Restarted bot.");
	
	res
		.status(200)
		.send("Restarted bot.")
		.end();
});


// cron job - ping every 60 mins to clear sessions >=20 mins old
// app.get("/timeoutCheck", (req, res) => {
// 	let sessionDeleteCount = 0;
	
// 	for (const i of Object.keys(activeSessions)) {
// 		if (checkTimeout(activeSessions[i])) {
// 			delete activeSessions[i];
// 			sessionDeleteCount += 1;
// 		}
// 	}

// 	if (sessionDeleteCount > 0) {
// 		console.log(`Deleted ${sessionDeleteCount} sessions.`);
// 	}
	
// 	res
// 		.status(200)
// 		.send(`Timeoutcheck done.`)
// 		.end();
// });

// app.get(`/${pairingCode}`, (req, res) => {
//   assignPairings();
  
//   res
//     .status(200)
//     .send("Pairings assigned!")
//     .end();
// });

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});

///* firebase database setup *///
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://chelonia-angel-mortal-db-default-rtdb.firebaseio.com",
  databaseAuthVariableOverride: {
    uid: "master-account"
  }
});

const db = admin.database();
const userRef = db.ref("users");

// database access functions
async function updateUser(userId, gender, house, details) {
	// set house-specific entry for pairings
	await db.ref(`houses/${house}/${userId}`).set({details: details, gender: gender});
	// set global entry for sending messages
	// set attributes separately to avoid overriding any existing data at this entry
	await db.ref(`users/${userId}/details`).set(details);
	await db.ref(`users/${userId}/gender`).set(gender);
}

async function listUsers(house, adminChatId) {
	bot.sendMessage(adminChatId, `ADMIN: Here are the registered users for house ${house}, in no particular order:`);
	await db.ref(`houses/${house}`).once("value", function(snapshot) {
		let currCount = 0;
		let totalCount = 0;
		let msg = "";
		snapshot.forEach(function(user) {
			currCount++;
			totalCount++;
			msg += `"${user.val().details}"\n\n`;
			if (currCount == 40) {
				bot.sendMessage(adminChatId, msg);
				currCount = 0;
				msg = "";
			}
		})
		if (currCount != 0) bot.sendMessage(adminChatId, msg);
	})
}

async function assignPairings(house, adminChatId, alternateGenders = true) {
	bot.sendMessage(adminChatId, `Running pairing algorithm for house ${house}...`);
	var allPlayers = [];
	var malePlayers = [];
	var femalePlayers = [];
	var otherPlayers = [];
	if (alternateGenders) {
		await db.ref(`houses/${house}`).once("value", function(snapshot) {
			snapshot.forEach(function(user) {
				if (user.val().gender == "M") malePlayers.push(user.key);
				else if (user.val().gender == "F") femalePlayers.push(user.key);
				else otherPlayers.push(user.key);
			});
		});
		
		malePlayers = shuffleArray(malePlayers);
		femalePlayers = shuffleArray(femalePlayers);
		otherPlayers = shuffleArray(otherPlayers);
		
		const playersArrays = [malePlayers, femalePlayers, otherPlayers];
		const maxLength = Math.max(malePlayers.length, femalePlayers.length, otherPlayers.length);
		for (let i = 0; i < maxLength; i++) { // iterate through shuffled arrays
			for (let j = 0; j < 3; j++) { // iterate through playersArrays
				if (i < playersArrays[j].length) allPlayers.push(playersArrays[j][i]);
			}
		}
	} else {
		var femalePairingPlayers = []; // players requesting only female angels and mortals
		await db.ref(`houses/${house}`).once("value", function(snapshot) {
			snapshot.forEach(function(user) {
				if (user.val().gender == "M") malePlayers.push(user.key);
				else if (user.val().gender == "F") {
					if (user.val().femaleOnly) femalePairingPlayers.push(user.key);
					else femalePlayers.push(user.key);
				}
				else otherPlayers.push(user.key);
			});
		});

		// handle female pairing players first
		if (femalePairingPlayers.length > 0) {
			femalePlayers = shuffleArray(femalePlayers);
			femalePairingPlayers = shuffleArray(femalePairingPlayers);
			allPlayers.push(femalePlayers.pop());
			allPlayers = allPlayers.concat(femalePairingPlayers);
			allPlayers.push(femalePlayers.pop());
		}

		// handle rest of players
		let restOfPlayers = shuffleArray(femalePlayers.concat(malePlayers).concat(otherPlayers));

		allPlayers = allPlayers.concat(restOfPlayers);
	}
	
	bot.sendMessage(adminChatId, "ADMIN: Here are the pairing results:");
  for (let i = 0; i < allPlayers.length; i++) {
    const angel = allPlayers[i];
    const mortal = allPlayers[(i + 1) % allPlayers.length];

    // set angel's mortal
    await db.ref(`users/${angel}/mortal`).set(mortal);
    // set mortal's angel
    await db.ref(`users/${mortal}/angel`).set(angel);
    // get mortal's details
    let details;
    let gender;
    await db.ref(`users/${mortal}`).once("value", function(snapshot) {
      details = snapshot.val().details;
      gender = snapshot.val().gender;
    });
    const message = "Hi angel! We have completed our angel-mortal pairings.\n\n"
                    + "Here's what your mortal said:\n"
                    + `"${details}"\n`
										+ `Gender: ${gender}\n\n`
										+ "You can now message them! For example: /mortal Hello mortal!\n\n"
										+ "Have fun!";
    bot.sendMessage(angel, message);
		bot.sendMessage(adminChatId, details);
	}
  
}

async function getAngel(userId) {
  var angel;
  await db.ref(`users/${userId}`).once("value", function(snapshot) {
		angel = snapshot.val().angel;
		if (angel && !snapshot.val().hasAccessedAngelOnce) {
			db.ref(`users/${userId}/hasAccessedAngelOnce`).set(true);
			bot.sendMessage(userId, accessAngelSuccessMessage, {parse_mode: "Markdown"});
		}
	});
  return angel;
}
  
async function getMortal(userId) {
  var mortal;
  await db.ref(`users/${userId}`).once("value", function(snapshot) {
		mortal = snapshot.val().mortal;
		if (mortal && !snapshot.val().hasAccessedMortalOnce) {
			db.ref(`users/${userId}/hasAccessedMortalOnce`).set(true);
			bot.sendMessage(userId, accessMortalSuccessMessage, {parse_mode: "Markdown"});
		}
	});
  return mortal;
}

async function getPlayerGender(userId) {
	var gender;
	await db.ref(`users/${userId}/gender`).once("value", function(snapshot) {
    gender = snapshot.val();
	});
	return gender;
}

async function unregisterUser(userId) {
	await db.ref(`users/${userId}`).set(null);
	await db.ref(`houses/Aonyx/${userId}`).set(null);
	await db.ref(`houses/Chelonia/${userId}`).set(null);
	bot.sendMessage(userId, "You have been successfully unregistered from the game.");
}

async function getPairings(house, adminChatId) {
	bot.sendMessage(adminChatId, `Here are the pairings for house ${house}: \n\n(This may take a while...)`)

	// get arbitrary user from house
	let startingKey = '';
	await db.ref(`houses/${house}`).limitToFirst(1).once("value", function(snapshot) {
		snapshot.forEach(function(user) {
			startingKey = user.key;
		})
	})

	// cycle through users until looped back to starting user
	let currKey = startingKey;
	let msg = "";
	let count = 0;
	let globalCount = 1;
	do {
		// possible to fetch entire section in one snapshot and query from there?
		await db.ref(`users/${currKey}`).once("value", function(snapshot) {
			msg += globalCount + '. ' + snapshot.val().details + "\n\n";
			count++;
			globalCount++;
			currKey = snapshot.val().mortal;
		})
		if (count == 30) {
			bot.sendMessage(adminChatId, msg);
			msg = '';
			count = 0;
		}
	} while (currKey != startingKey)
	if (count != 0) await bot.sendMessage(adminChatId, msg);

	bot.sendMessage(adminChatId, adminPairingsRetrievedMessage);
}

async function test(id) {
	await db.ref(`users/500326343`).once("value", function(snapshot) {
		if (snapshot.val().femaleOnly) 
		console.log('yes');
		else console.log("no");
	});
	//bot.sendMessage(id, "👨‍🦲*MORTAL*\n💬: " + "hi!!!", {parse_mode: "Markdown"});
}

///* main *///

const activeSessions = {};
const mealServicesCache = {};
const foundItemCache = {};
const menuFeedbackCache = {};

// replace the value below with the Telegram token you receive from @BotFather
// live
// const token = liveToken;
const token = rvrcAngelMortalToken;
// testing
// const token = testingToken;

// Create a bot that uses 'polling' to fetch new updates
let bot = new telegramBot(token, {polling: true});

// Matches "/echo [whatever]"
bot.onText(/\/echo (.+)/, (msg, match) => {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message
  const chatId = msg.chat.id;
  const resp = match[1]; // the captured "whatever"

  // send back the matched "whatever" to the chat
  bot.sendMessage(chatId, resp);
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    let dummyResponse; // to pass to processAction if Dialogflow is bypassed
	
	if (msg.text.slice(0, 7).toLowerCase() == "/angel " && msg.text.slice(7) != '') {
		console.log(chatId + ": " + msg.text);
		sendMessageToAngel(chatId, msg.text.slice(7));
	} else if (msg.text.slice(0, 3).toLowerCase() == "/a " && msg.text.slice(3) != '') {
		console.log(chatId + ": " + msg.text);
		sendMessageToAngel(chatId, msg.text.slice(3));
	} else if (msg.text.slice(0, 8).toLowerCase() == "/mortal " && msg.text.slice(8) != '') {
		console.log(chatId + ": " + msg.text);
		sendMessageToMortal(chatId, msg.text.slice(8));
	} else if (msg.text.slice(0, 3).toLowerCase() == "/m " && msg.text.slice(3) != '') {
		console.log(chatId + ": " + msg.text);
		sendMessageToMortal(chatId, msg.text.slice(3));
	} else {	

		switch(msg.text) {
			
			case "/about":
				bot.sendMessage(chatId, aboutMessage);
				break;
			
			case "/help":
				bot.sendMessage(chatId, helpMessage);
				break;
				
			case "/start":
				bot.sendMessage(chatId, startMessage);
				break;

      case "/extra":
        bot.sendMessage(chatId, extraMessage);
			  break;

			case "/admin":
				bot.sendMessage(chatId, verifyAdminMessage);
				break;

			case `${CheloniaPassword} Chelonia`:
				assignPairings("Chelonia", chatId);
				break;
			
			case `${AonyxPassword} Aonyx`:
				assignPairings("Aonyx", chatId, false);
				break;

			case `listUsers ${CheloniaPassword}`:
				listUsers("Chelonia", chatId);
				break;

			case `listUsers ${AonyxPassword}`:
				listUsers("Aonyx", chatId);
				break;

			case `getPairings ${CheloniaPassword}`:
				getPairings("Chelonia", chatId);
				break;

			case `getPairings ${AonyxPassword}`:
				getPairings("Aonyx", chatId);
				break;
			
			case "/unregister":
				unregisterUser(chatId);
				break;

			// case "test":
			// case "/test":
			// 	getPairings(chatId, "B");
			// 	break;

			default:
				awaitAndSendResponse(msg).catch(err => console.error(`Error awaitAndSendResponse: ${err}`));
		
		}
	}
});

bot.on('callback_query', (query) => {
	const queryId = query.id;
	const callbackData = query.data.split(' ');
	bot.answerCallbackQuery(queryId);

	processCallbackQuery(query);
});

async function awaitAndSendResponse(msg) {
	const chatId = msg.chat.id;
	bot.sendChatAction(chatId, "typing");
	const projectId = 'chelonia-angel-mortal-db';

	const sessionClient = new dialogflow.SessionsClient();
	let sessionPath = null;
	if (activeSessions[chatId]) {
		sessionPath = activeSessions[chatId].sessionPath;
		activeSessions[chatId] = {time: Date.now(),
								  sessionPath: sessionPath};
	} else {
		const sessionId = uuid.v4();
		sessionPath = sessionClient.sessionPath(projectId, sessionId);
		activeSessions[chatId] = {time: Date.now(),
								  sessionPath: sessionPath};
	}

	// The text query request.
	const request = {
		session: sessionPath,
		queryInput: {
			text: {
				text: msg.text,
				languageCode: 'en-US',
			},
		},
	};
	
	// Send request and log result
	const responses = await sessionClient.detectIntent(request);
	//console.log('Detected intent');
	const result = responses[0].queryResult;
	/*console.log(`  Query: ${result.queryText}`);
	console.log(`  Response: ${result.fulfillmentText}`);
	if (result.intent) {
		console.log(`  Intent: ${result.intent.displayName}`);
	} else {
		console.log(`  No intent matched.`);
	}*/
	
	// initialise text response to send back to user
	var responseText;
	var responseOptions = {parse_mode: "Markdown"};
	var sendingStyle = null;
	if (result.fulfillmentText) {
		responseText = result.fulfillmentText;
	}

	// if matched intent contains an action, call processAction
	if (result.action) {
		const actionResponse = await processAction(responses, chatId);
		
		// update each field only if processAction returns a non-null value
		if (actionResponse.message) {
			responseText = actionResponse.message;
		}
		if (actionResponse.options) {
			responseOptions = actionResponse.options;
		}
		if (actionResponse.sendingStyle) {
			sendingStyle = actionResponse.sendingStyle;
		}
	}
	
	/* Not currently needed
	// console.log(responses[0].queryResult.outputContexts);
	responses[0].queryResult.outputContexts.forEach(context => {
	  // There is a bug in gRPC that the returned google.protobuf.Struct
	  // value contains fields with value of null, which causes error
	  // when encoding it back. Converting to JSON and back to proto
	  // removes those values.
	  context.parameters = structjson.jsonToStructProto(
		structjson.structProtoToJson(context.parameters)
	  );
	});
	*/

	// send message back to Telegram
	if (sendingStyle === "sendAsJoke") {
		sendMultipleMessages(chatId, responseText, 2000);
	} else {
		bot.sendMessage(chatId, responseText, responseOptions);
	}
}

/* 
Handles processing for all intents that return an action.
Returns an object in the following form:
{
 responseText: string containing message to send,
 responseOptions: object corresponding to additional sendMessage parameters,
[sendingStyle]: string describing additional options (e.g. send as multiple messages)
}
*/

async function processAction(responses, id) {
	let result = responses[0].queryResult;
	const inputParams = result.parameters.fields;
	let responseText = result.fulfillmentText;
	let sendingStyle = null;
	let responseOptions = {parse_mode: "Markdown"};
	let dateNow = new Date(Date.now());
	
	switch (result.action) {
		
    case 'get-gender':
      responseOptions.reply_markup = genderSelectKeyboard;
      break;
		
    case 'get-house':
			responseOptions.reply_markup = houseSelectKeyboard;
	  	break;
	
		case 'update-user':
			const contextParameters = result.outputContexts[0].parameters.fields;
			const gender = contextParameters["gender"].stringValue;
			const house = contextParameters["house"].stringValue;
			const details = result.queryText;
			await updateUser(id, gender, house, details);
			console.log("Registered: " + gender + house + ' / House ' + ' / ' + details);
			responseText = result.fulfillmentText;
			responseOptions = null;
			break;

    case 'send-message-to-angel':
      const angelId = await getAngel(id);
			if (!angelId) responseText = pairingNotFoundMessage;
			else {
				bot.sendMessage(angelId, "👨‍🦲 *MORTAL*\n💬: " + result.queryText, {parse_mode: "Markdown"});
				responseText = messageSentMessage;
			}
      responseOptions = null;
      break;

    case 'send-message-to-mortal':
			const mortalId = await getMortal(id);
			if (!mortalId) responseText = pairingNotFoundMessage;
			else {
				bot.sendMessage(mortalId, "👼 *ANGEL*\n💬: " + result.queryText, {parse_mode: "Markdown"});
				responseText = messageSentMessage;
			}
      responseOptions = null;
      break;
      
		default:
			responseText = null;
			responseOptions = null;
	}

	return {message: responseText,
			options: responseOptions,
			sendingStyle: sendingStyle}
}

async function sendMessageToAngel(mortalId, message) {
	const angelId = await getAngel(mortalId);
	if (!angelId) bot.sendMessage(mortalId, pairingNotFoundMessage);
	else {
		try {
			await bot.sendMessage(angelId, "👨‍🦲 *MORTAL*\n💬: " + message, {parse_mode: "Markdown"});
			//bot.sendMessage(mortalId, messageSentMessage);
		} catch (e) {
			try {
				console.log("Error. Trying HTML parse mode...");
				await bot.sendMessage(angelId, "👨‍🦲 *MORTAL*\n💬: " + message, {parse_mode: "HTML"});
				//bot.sendMessage(mortalId, messageSentMessage);		
			} catch (e) {
				console.log("Error.");
				bot.sendMessage(mortalId, "Error sending message! :(\n\nPlease try again.");
			}
		}
		
	}
}

async function sendMessageToMortal(angelId, message) {
	const mortalId = await getMortal(angelId);
	if (!mortalId) bot.sendMessage(angelId, pairingNotFoundMessage);
	else {
		try {
			await bot.sendMessage(mortalId, "👼 *ANGEL*\n💬: " + message, {parse_mode: "Markdown"});
			//bot.sendMessage(angelId, messageSentMessage);
		} catch (e) {
			try {
				console.log("Error. Trying HTML parse mode...");
				await bot.sendMessage(mortalId, "👼 *ANGEL*\n💬: " + message, {parse_mode: "HTML"});
				//bot.sendMessage(angelId, messageSentMessage);
			} catch (e) {
				console.log("Error.");
				bot.sendMessage(angelId, "Error sending message! :(\n\nPlease try again.")
			}
		}		
	}
}

async function processCallbackQuery(query) {
	const chatId = query.from.id;
	const queryId = query.id;
	const messageId = query.message.message_id;
	let callbackData = query.data;
	
	let responseText = '';
	let sendingStyle = null;
	let responseOptions = {parse_mode: "Markdown"};
	
	switch (callbackData.split(' ')[0]) {
	
		default:
		
	}
}
///* helper functions *///

async function sendWithoutDialogflow(chatId, dummyResponse) {
    bot.sendChatAction(chatId, "typing");
    const result = await processAction(dummyResponse, chatId);
    bot.sendMessage(chatId, result.responseText, result.responseOptions);
}

async function sendMultipleMessages(chatId, msgs, delay) {
	bot.sendMessage(chatId, msgs.shift());
	for (const i in msgs) {
		bot.sendChatAction(chatId, "typing");
		await sleep(delay);
		bot.sendMessage(chatId, msgs[i]);
		await sleep(500);
	}
}

