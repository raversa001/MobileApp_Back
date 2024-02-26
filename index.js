require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3030;

app.use(cors());
app.use(bodyParser.json());

const uri = "mongodb+srv://nimda:64yrLL7wksBj88qW@cluster0.43szltv.mongodb.net/admin?authSource=admin&replicaSet=atlas-bkga7t-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true";
const client = new MongoClient(uri);

const SECRET_KEY = "k:.svU0gK)N1M6Jg4l4Qxv.(iJzgCrX.l=/hv@!R*(ct(8N1ROMnnzR6D)AXImf+";

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
                { expiresIn: '24h' }
            );

            const sessionsCollection = client.db("devmobile").collection("sessions");
            const session = await sessionsCollection.insertOne({
                token,
                username: user.login,
                createdAt: new Date(),
                expiresAt: new Date(new Date().getTime() + (24 * 60 * 60 * 1000))
            });

            res.status(200).send({ message: "Connexion réussie", token });
        } else {
            res.status(401).send({ message: "Connexion échouée" });
        }
    } catch (e) {
        res.status(500).send({ message: "Erreur serveur", error: e });
    }
});

app.get('/isLoggedIn', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];

    if (!token || !token.length)
        return res.status(401).send({ message: 'Aucun token renvoyé' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Impossible de vérifier le token.' });

        const sessionsCollection = client.db("devmobile").collection("sessions");
        const session = await sessionsCollection.findOne({
            token: token,
            expiresAt: { $gt: new Date() }
        });

        if (!session) return res.status(404).send({ message: 'Session introuvable.' });

        res.status(200).send({ username: session.username });
    });
});

app.get('/activities', async (req, res) => {
    try {
        const activitiesCollection = client.db("devmobile").collection("activities");
        const activities = await activitiesCollection.find({}).toArray();
        res.status(200).send(activities);
    } catch (e) {
        console.error(e);
        res.status(500).send({ message: "Impossible de récupérer les activités", error: e.toString() });
    }
});

app.post('/addToBasket', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    const { activityId } = req.body;

    if (!token) return res.status(401).send({ message: 'Un token est requis' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Impossible de vérifier le token.' });

        const userId = decoded.userId;

        try {
            const basketsCollection = client.db("devmobile").collection("baskets");
            const basket = await basketsCollection.findOne({ userId: userId });

            if (basket && basket.activities.includes(activityId)) {
                return res.status(400).send({ message: 'L\'activité est déjà dans le panier' });
            }

            if (basket) {
                await basketsCollection.updateOne(
                    { userId: userId },
                    { $addToSet: { activities: activityId } }
                );
            } else {
                await basketsCollection.insertOne({
                    userId: userId,
                    activities: [activityId]
                });
            }
            res.status(200).send({ message: 'Activité ajoutée au panier' });
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Impossible de mettre à jour le panier', error: dbError.toString() });
        }
    });
});

app.get('/basket', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Un token est requis' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Impossible de vérifier le token.' });

        const userId = decoded.userId;

        try {
            const basketsCollection = client.db("devmobile").collection("baskets");
            const basket = await basketsCollection.findOne({ userId: userId });

            if (!basket) return res.status(404).send({ message: 'Panier introuvable.' });

            const activitiesCollection = client.db("devmobile").collection("activities");
            const activities = await activitiesCollection.find({
                _id: { $in: basket.activities.map(activityId => new ObjectId(activityId)) }
            }).toArray();

            res.status(200).send(activities);
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Erreur lors de la récupération du paniere', error: dbError.toString() });
        }
    });
});

app.post('/removeFromBasket', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    const { activityId } = req.body;

    if (!token) return res.status(401).send({ message: 'Un token est requis' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Impossible de vérifier le token.' });

        const userId = decoded.userId;

        try {
            const basketsCollection = client.db("devmobile").collection("baskets");

            await basketsCollection.updateOne(
                { userId: userId },
                { $pull: { activities: activityId } }
            );

            res.status(200).send({ message: 'Activité supprimée du panier' });
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Erreur lors du retrait de l\'activité du panier', error: dbError.toString() });
        }
    });
});

app.get('/profile', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Un token est requis' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Impossible de vérifier le token.' });

        const userId = decoded.userId;

        try {
            const usersCollection = client.db("devmobile").collection("users");
            const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

            if (!user) return res.status(404).send({ message: 'Utilisateur introuvable.' });

            res.status(200).send(user);
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Erreur lors de la récupération du profil', error: dbError.toString() });
        }
    });
});

app.post('/profile/update', async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Un token est requis' });

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Impossible de vérifier le token.' });

        const userId = decoded.userId;
        const { password, birthday, address, postalCode, city } = req.body;

        let updateObject = { birthday, address, postalCode, city };

        if (password && password.trim() !== '')
            updateObject.password = password;

        try {
            const usersCollection = client.db("devmobile").collection("users");
            await usersCollection.updateOne(
                { _id: new ObjectId(userId) },
                { $set: updateObject }
            );

            res.status(200).send({ message: 'Profil mis à jour avec succès' });
        } catch (dbError) {
            console.error(dbError);
            res.status(500).send({ message: 'Erreur lors de la mise à jour du profil', error: dbError.toString() });
        }
    });
});


app.post('/register', async (req, res) => {
    const { login, password } = req.body;

    try {
        const usersCollection = client.db("devmobile").collection("users");

        const userExists = await usersCollection.findOne({ login });
        if (userExists) {
            return res.status(400).send({ message: "Ce nom d\'utilisateur est déjà utilisé" });
        }

        await usersCollection.insertOne({ login, password });
        res.status(200).send({ message: "Utilisateur enregistré avec succès" });
    } catch (e) {
        res.status(500).send({ message: "Erreur serveur", error: e.toString() });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    connectToDB();
});
