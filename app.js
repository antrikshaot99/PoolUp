// app.js

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const morgan = require('morgan');
const redis = require('redis');

dotenv.config();

const app = express();
app.set("trust proxy", 1);

// ======================
// ✅ MONGODB CONNECTION (MOST IMPORTANT)
// ======================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => {
        console.error("❌ MongoDB connection failed:", err);
        process.exit(1);
    });

// ======================
// SERVER + WEBSOCKET
// ======================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ======================
// REDIS
// ======================
const REDIS_URL = process.env.REDIS_URL;
const redisClient = redis.createClient({ url: REDIS_URL });

redisClient.connect()
    .then(() => console.log("✅ Redis Connected"))
    .catch(err => console.error("❌ Redis error:", err));

// ======================
// MIDDLEWARE
// ======================
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ======================
// EJS
// ======================
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// ======================
// MODELS
// ======================
const User = require('./models/User');
const Carpool = require('./models/Carpool');
const Chat = require('./models/Chat');
const { auth, admin } = require('./middleware/auth');

// ======================
// GLOBAL AUTH MIDDLEWARE
// ======================
app.use((req, res, next) => {
    const token = req.cookies.token_toggle || req.cookies.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            res.locals.user = decoded;
        } catch {
            req.user = null;
            res.locals.user = null;
        }
    } else {
        req.user = null;
        res.locals.user = null;
    }
    next();
});

// ======================
// ROUTES
// ======================

// HOME
app.get('/', async (req, res) => {
    if (!req.user) {
        return res.render('home', { title: 'Welcome', carpools: [] });
    }

    const carpools = await Carpool.find()
        .sort({ createdAt: -1 })
        .populate('userId', 'name email');

    res.render('home', { title: 'Dashboard', carpools });
});

// ======================
// AUTH ROUTES
// ======================
app.get('/auth/login-register', (req, res) => {
    res.render('auth/login-register', {
        title: 'Login / Register',
        error: null,
        message: null
    });
});

// REGISTER
app.post('/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const existing = await User.findOne({ email });
        if (existing) {
            return res.render('auth/login-register', {
                title: 'Login / Register',
                error: 'User already exists',
                message: null
            });
        }

        await User.create({ name, email, password });

        res.render('auth/login-register', {
            title: 'Login / Register',
            message: 'Registration successful. Please login.',
            error: null
        });
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.render('auth/login-register', {
            title: 'Login / Register',
            error: 'Server error',
            message: null
        });
    }
});

// LOGIN
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('auth/login-register', {
                title: 'Login / Register',
                error: 'Invalid credentials',
                message: null
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render('auth/login-register', {
                title: 'Login / Register',
                error: 'Invalid credentials',
                message: null
            });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        res.redirect('/');
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.render('auth/login-register', {
            title: 'Login / Register',
            error: 'Server error',
            message: null
        });
    }
});

// LOGOUT
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/auth/login-register');
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
