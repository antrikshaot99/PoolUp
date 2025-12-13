// tests/e2e.test.js
const puppeteer = require('puppeteer');
const db = require('./db_setup');
const User = require('../models/User');
const { app, server } = require('../app'); 
const mongoose = require('mongoose'); 

const PORT = 4000 + (parseInt(process.env.JEST_WORKER_ID) || 0);
const APP_URL = `http://localhost:${PORT}`;

let browser;
let page;
let appServer; 

const newUser = {
    name: 'Browser User',
    email: 'browser_user@example.com',
    password: 'securePassword123'
};

const carpoolData = {
    carName: 'Honda City',
    location: 'Main Gate',
    price: '50',
    seats: '3'
};

beforeAll(async () => {
    await db.connect();
    appServer = server.listen(PORT, () => console.log(`E2E server started on ${PORT}`));
    browser = await puppeteer.launch({ 
    headless: true,   // Open a real browser window
    slowMo: 100,       // Slow down actions by 100ms so you can see them happening
    args: ['--no-sandbox'] 
});
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000); 
});

beforeEach(async () => {
    await db.clearDatabase();
});

afterAll(async () => {
    if (browser) await browser.close();
    if (appServer) await appServer.close();
    await db.closeDatabase();
});

describe('Full Browser User Journey', () => {
    it('should allow a user to Register, Login, and Create a Carpool', async () => {
        // --- STEP 1: REGISTER ---
        await page.goto(`${APP_URL}/auth/login-register`);
        await page.type('form[action="/auth/register"] input[name="name"]', newUser.name);
        await page.type('form[action="/auth/register"] input[name="email"]', newUser.email);
        await page.type('form[action="/auth/register"] input[name="password"]', newUser.password);
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('form[action="/auth/register"] button[type="submit"]')
        ]);

        // --- STEP 2: LOGIN ---
        if (!page.url().includes('auth')) await page.goto(`${APP_URL}/auth/login-register`);
        
        await page.type('form[action="/auth/login"] input[name="email"]', newUser.email);
        await page.type('form[action="/auth/login"] input[name="password"]', newUser.password);

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('form[action="/auth/login"] button[type="submit"]')
        ]);

        // --- STEP 3: CREATE OFFER ---
        console.log('Step 3: Creating Carpool Offer...');
        await page.click('a[href="/carpools/new"]'); 
        await page.waitForSelector('form');
        
        await page.type('input[name="carName"]', carpoolData.carName);
        await page.type('input[name="location"]', carpoolData.location);
        await page.type('input[name="price"]', carpoolData.price);
        await page.type('input[name="totalSeats"]', carpoolData.seats);

        // Fill TIME and GENDER with event dispatching
        // Generate a future datetime (tomorrow at 10:00 AM)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        const futureDateTime = tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
        
        await page.evaluate((dateTimeValue) => {
            const timeInput = document.querySelector('input[name="time"]');
            if (timeInput) {
                timeInput.value = dateTimeValue; 
                timeInput.dispatchEvent(new Event('input', { bubbles: true }));
                timeInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const genderSelect = document.querySelector('select[name="gender"]');
            if (genderSelect) {
                genderSelect.value = 'any'; 
                if (!genderSelect.value && genderSelect.options.length > 0) genderSelect.selectedIndex = 0;
                genderSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, futureDateTime);

        // Submit form
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.$eval('form', form => form.submit()) 
        ]);

        // --- STEP 4: VERIFY ---
        const dashboardContent = await page.content();
        
        if (dashboardContent.includes('Server error')) {
            throw new Error('Form submission caused 500 Server Error. Check server logs for validation details.');
        }

        expect(dashboardContent).toContain(carpoolData.carName);

    }, 100000);
});