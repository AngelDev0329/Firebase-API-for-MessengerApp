const functions = require('firebase-functions');
const admin = require ("firebase-admin");
admin.initializeApp();
const firestore = admin.firestore();

/*
** When a user updates their profile info (email, profile picture, first name, etc)
** We update all the firestore tables that contain copies of that user object
*/
exports.propagateUserProfileUpdates = functions.firestore
.document("users/{userID}")
.onUpdate((change, context) => {
    const userData = change.after.data();
    if (!userData) {
        console.log("no user data");
        return;
    }

    updateChatConversations(userData)

    // Social Graph
    updateReversedSocialGraph(userData, "inbound_users")
    updateReversedSocialGraph(userData, "outbound_users")

    return null
});

const updateChatConversations = async (userData) => {
    // Update all chat conversations where this user has been the sender
    const querySnapshot = await firestore
        .collectionGroup('thread')
        .where('senderID', '==', userData.id)
        .get()

    let docs = querySnapshot.docs;
    for (let doc of docs) {
        var data = {}
        if (userData.firstName) {
            data['senderFirstName'] = userData.firstName
        }
        if (userData.lastName) {
            data['senderLastName'] = userData.lastName
        }
        if (userData.profilePictureURL) {
            data['senderProfilePictureURL'] = userData.profilePictureURL
        }
        doc.ref.set(data, {merge: true})
    }

    // Update all conversations where this user is a participant
    updateChatFeeds(userData)
}

const updateChatFeeds = async (userData) => {
    // Fetch all channels for the current user
    const mySnapshot = await firestore
        .collection("social_feeds")
        .doc(userData.id)
        .collection("chat_feed")
        .get()
    const myDocs = mySnapshot.docs
    myDocs.forEach(async myDoc => {
        const channelID = myDoc.id
        const querySnapshot = await firestore
            .collectionGroup('chat_feed')
            .where('id', '==', channelID)
            .get()

        let docs = querySnapshot.docs;
        console.log("Updating social_feeds -> chat_feed for channel ID " + channelID + ". " + docs.length + " channels to update")
        docs.forEach(async doc => {
            var prevData = doc.data()
            var prevParticipants = prevData.participants
            var newParticipants = new Array()
            for (let index in prevParticipants) {
                const participant = prevParticipants[index]
                if (participant.id === userData.id) {
                    newParticipants.push(userData)
                } else {
                    newParticipants.push(participant)
                }
            }
            var data = { participants: newParticipants }
            if (newParticipants.length === 1 && newParticipants[0].id === userData.id) {
                const title = userData.firstName + " " + userData.lastName
                data["title"] = title
            }
            await doc.ref.set(data, {merge: true})
        })

        console.log("Updating channels participants for channel ID " + channelID + " in channels table")
        const channelDoc = await firestore.collection("channels").doc(channelID).get()
        const channelData = channelDoc.data()
        const prevChannelParticipants = channelData.participants
        var newChannelParticipants = new Array()
        for (let index in prevChannelParticipants) {
            const participant = prevChannelParticipants[index]
            if (participant.id === userData.id) {
                newChannelParticipants.push(userData)
            } else {
                newChannelParticipants.push(participant)
            }
        }
        await channelDoc.ref.set({ participants: newChannelParticipants }, {merge: true})
    });
}

const updateReversedSocialGraph = async (userData, collectionName) => {
    const querySnapshot = await firestore
        .collectionGroup(collectionName)
        .where('id', '==', userData.id)
        .get()

    let docs = querySnapshot.docs;
    for (let doc of docs) {
        console.log("Updating " + collectionName + ": #" + doc.id)
        doc.ref.set(userData)
    }
}
