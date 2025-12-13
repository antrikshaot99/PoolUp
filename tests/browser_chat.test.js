// tests/browser_chat.test.js
const puppeteer = require('puppeteer');
const db = require('./db_setup');
const Carpool = require('../models/Carpool'); 
const { app, server } = require('../app'); 
const mongoose = require('mongoose'); 

const PORT = 5000 + (parseInt(process.env.JEST_WORKER_ID) || 0);
const APP_URL = `http://localhost:${PORT}`;

let browser;
let appServer; 

const alice = { name: 'Alice Driver', email: 'alice@chat.com', password: 'password123' };
const bob = { name: 'Bob Passenger', email: 'bob@chat.com', password: 'password123' };

// --- VISUAL SETTINGS ---
const SLOW_MO = 80;     // 80ms delay to make actions visible but snappy
const VIEW_TIME = 4000; // 4 seconds pause to look at the screen

beforeAll(async () => {
    await db.connect();
    appServer = server.listen(PORT, () => console.log(`Test server running on ${PORT}`));
    
    browser = await puppeteer.launch({ 
        headless: false, 
        slowMo: SLOW_MO, 
        args: ['--no-sandbox', '--window-size=1200,800'],
        defaultViewport: null
    });
});

beforeEach(async () => {
    await db.clearDatabase();
});

afterAll(async () => {
    if (browser) await browser.close();
    if (appServer) await appServer.close();
    await db.closeDatabase();
});

// Helper to handle Login
async function setupUserSession(context, user) {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60000); 

    await page.goto(`${APP_URL}/auth/login-register`);
    
    // Register
    await page.type('form[action="/auth/register"] input[name="name"]', user.name);
    await page.type('form[action="/auth/register"] input[name="email"]', user.email);
    await page.type('form[action="/auth/register"] input[name="password"]', user.password);
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('form[action="/auth/register"] button[type="submit"]')
    ]);

    // Login if needed
    if (page.url().includes('auth')) {
        await page.type('form[action="/auth/login"] input[name="email"]', user.email);
        await page.type('form[action="/auth/login"] input[name="password"]', user.password);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('form[action="/auth/login"] button[type="submit"]')
        ]);
    }
    return page;
}

describe('Full Integration: Offer -> Discovery -> Chat', () => {
    it('Alice creates offer, Bob sees it, then they chat', async () => {
        // --- 1. LOGIN BOTH USERS ---
        console.log('👥 Logging in Alice and Bob...');
        const contextA = await browser.createBrowserContext(); 
        const contextB = await browser.createBrowserContext(); 

        const pageA = await setupUserSession(contextA, alice);
        const pageB = await setupUserSession(contextB, bob);

        // --- 2. ALICE CREATES OFFER ---
        console.log('🚗 Alice creates the offer...');
        await pageA.click('a[href="/carpools/new"]');
        await pageA.waitForSelector('form');

        await pageA.type('input[name="carName"]', 'Visual Test Ride');
        await pageA.type('input[name="location"]', 'Campus to Mall');
        await pageA.type('input[name="price"]', '50');
        await pageA.type('input[name="totalSeats"]', '3');

        // Generate a future datetime (tomorrow at 6 PM)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(18, 0, 0, 0);
        const futureDateTime = tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm

        await pageA.evaluate((dateTimeValue) => {
            const timeInput = document.querySelector('input[name="time"]');
            if (timeInput) timeInput.value = dateTimeValue; 
            const genderSelect = document.querySelector('select[name="gender"]');
            if (genderSelect) genderSelect.selectedIndex = 0;
        }, futureDateTime);

        await Promise.all([
            pageA.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageA.$eval('form', form => form.submit())
        ]);

        // --- 3. BOB SEES THE OFFER (New Step!) ---
        console.log('👀 Bob checking dashboard for the new ride...');
        
        // Bob refreshes his dashboard to see the latest data
        await pageB.goto(APP_URL);
        
        // Verify text exists
        const dashboardContent = await pageB.content();
        expect(dashboardContent).toContain('Visual Test Ride');
        
        // Bring Bob's page to front so you can see it
        await pageB.bringToFront();
        console.log('✨ Offer visible on Bob\'s screen! Pausing...');
        await new Promise(r => setTimeout(r, VIEW_TIME));

        // --- 4. JOIN CHAT ---
        const carpool = await Carpool.findOne({ carName: 'Visual Test Ride' });
        const chatUrl = `${APP_URL}/chat/${carpool._id}`;

        console.log('💬 Both joining chat...');
        await pageA.goto(chatUrl);
        await pageB.goto(chatUrl);

        // Wait for connection
        await new Promise(r => setTimeout(r, 2000));

        // --- 5. ALICE SENDS MESSAGE ---
        const messageText = "Hi Bob! I see you found my ride.";
        console.log(`Alice typing: "${messageText}"`);

        await pageA.bringToFront();
        await pageA.waitForSelector('#message-input');
        await pageA.type('#message-input', messageText);
        
        // Dispatch Submit Event (The Fix)
        await pageA.evaluate(() => {
            const form = document.querySelector('#chat-form');
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        });

        // --- 6. BOB RECEIVES ---
        console.log('📩 Bob receiving message...');
        await pageB.bringToFront(); // Switch focus to Bob so you can see the message appear
        
        await pageB.waitForFunction(
            (text) => document.body.innerText.includes(text),
            { timeout: 10000 }, 
            messageText
        );

        console.log('✨ Message Received! Pausing...');
        await new Promise(r => setTimeout(r, VIEW_TIME));

        const content = await pageB.content();
        expect(content).toContain(messageText);

    }, 120000); 
});