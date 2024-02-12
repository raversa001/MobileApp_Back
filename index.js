require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3030; // Updated port

app.use(cors());
app.use(bodyParser.json());

// Your MongoDB connection string
const uri = "mongodb+srv://nimda:64yrLL7wksBj88qW@cluster0.43szltv.mongodb.net/admin?authSource=admin&replicaSet=atlas-bkga7t-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// Secret key for JWT signing
const SECRET_KEY = "k:.svU0gK)N1M6Jg4l4Qxv.(iJzgCrX.l=/hv@!R*(ct(8N1ROMnnzR6D)AXImf+"; // In production, store this in an environment variable or a secure config

async function connectToDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
    } catch (e) {
        console.error(e);
    }
}

app.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        const usersCollection = client.db("devmobile").collection("users");
        const user = await usersCollection.findOne({ login, password });
        if (user) {
            const token = jwt.sign(
                { userId: user._id, login: user.login },
                SECRET_KEY,
                { expiresIn: '24h' } // Token expires in 24 hours
            );

            // Store the token in the sessions collection
            const sessionsCollection = client.db("devmobile").collection("sessions");
            const session = await sessionsCollection.insertOne({
                token,
                username: user.login,
                createdAt: new Date(), // Time of generation
                expiresAt: new Date(new Date().getTime() + (24 * 60 * 60 * 1000)) // 24 hours from now
            });

            res.status(200).send({ message: "Login successful", token });
        } else {
            res.status(401).send({ message: "Login failed" });
        }
    } catch (e) {
        res.status(500).send({ message: "Server error", error: e });
    }
});

app.get('/isLoggedIn', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1]; // Assuming token is sent as "Bearer <token>"

    if (!token || !token.length)
        return res.status(401).send({ message: 'No token provided.' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Failed to authenticate token.' });

        // Check if the token exists in sessions collection and hasn't expired
        const sessionsCollection = client.db("devmobile").collection("sessions");
        const session = await sessionsCollection.findOne({
            token: token,
            expiresAt: { $gt: new Date() } // checks if the token hasn't expired
        });

        if (!session) return res.status(404).send({ message: 'Session not found or expired.' });

        // If the token is found and valid, return the username
        res.status(200).send({ username: session.username });
    });
});

// After connecting to the database and other app setups

app.get('/activities', async (req, res) => {
    try {
        const activitiesCollection = client.db("devmobile").collection("activities");
        const activities = await activitiesCollection.find({}).toArray();
        res.status(200).send(activities);
    } catch (e) {
        console.error(e);
        res.status(500).send({ message: "Failed to fetch activities", error: e.toString() });
    }
});

app.post('/addToBasket', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1]; // Assuming token is sent as "Bearer <token>"
    const { activityId } = req.body; // The ID of the activity to add

    if (!token) return res.status(401).send({ message: 'Token is required' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Failed to authenticate token.' });

        // Assuming the decoded token includes the userId
        const userId = decoded.userId;

        try {
            const basketsCollection = client.db("devmobile").collection("baskets");
            // Check if the basket for the user already exists
            const basket = await basketsCollection.findOne({ userId: userId });
            if (basket) {
                // If basket exists, add the activity to it
                await basketsCollection.updateOne(
                    { userId: userId },
                    { $push: { activities: activityId } }
                );
            } else {
                // If no basket exists, create a new one with the activity
                await basketsCollection.insertOne({
                    userId: userId,
                    activities: [activityId]
                });
            }
            res.status(200).send({ message: 'Activity added to basket successfully' });
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Error updating basket', error: dbError.toString() });
        }
    });
});

app.get('/basket', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Token is required' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Failed to authenticate token.' });

        const userId = decoded.userId;

        try {
            const basketsCollection = client.db("devmobile").collection("baskets");
            const basket = await basketsCollection.findOne({ userId: userId });

            if (!basket) return res.status(404).send({ message: 'Basket not found.' });

            const activitiesCollection = client.db("devmobile").collection("activities");
            const activities = await activitiesCollection.find({
                _id: { $in: basket.activities.map(activityId => new ObjectId(activityId)) }
            }).toArray();

            res.status(200).send(activities);
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Error fetching basket', error: dbError.toString() });
        }
    });
});

app.post('/removeFromBasket', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    const { activityId } = req.body;

    if (!token) return res.status(401).send({ message: 'Token is required' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Failed to authenticate token.' });

        const userId = decoded.userId;

        try {
            const basketsCollection = client.db("devmobile").collection("baskets");
            await basketsCollection.deleteOne(
                { userId: userId },
                { $pull: { activities: new ObjectId(activityId) } }
            );

            res.status(200).send({ message: 'Activity removed from basket successfully' });
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Error removing activity from basket', error: dbError.toString() });
        }
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    connectToDB();
});
