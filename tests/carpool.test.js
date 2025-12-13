// tests/carpool.test.js
const request = require('supertest');
const { app } = require('../app');
const db = require('./db_setup');
const User = require('../models/User');
const Carpool = require('../models/Carpool');
const jwt = require('jsonwebtoken');

let mockUser;
let userToken;

// --- HOOKS ---
beforeAll(async () => await db.connect());
beforeEach(async () => {
    await db.clearDatabase(); // Clears DB and makes admin
    mockUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
    });
    userToken = jwt.sign(
        { id: mockUser._id, name: mockUser.name, email: mockUser.email, role: mockUser.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
});
afterAll(async () => await db.closeDatabase());
// --- END HOOKS ---

describe('Carpool Routes', () => {

    // tests/carpool.test.js

// ... inside the first 'it' block ...
it('should block unauthenticated users from seeing the create page', async () => {
    const response = await request(app)
        .get('/carpools/new');
    expect(response.statusCode).toBe(302);
    // CHANGE THIS LINE:
    expect(response.headers.location).toBe('/login'); 
});

    it('should allow authenticated users to see the create page', async () => {
        const response = await request(app)
            .get('/carpools/new')
            .set('Cookie', `token=${userToken}`);
        expect(response.statusCode).toBe(200);
        expect(response.text).toContain('Create Offer');
    });

    it('should allow an authenticated user to create a new carpool offer', async () => {
        const mockCarpool = {
            carName: 'Test Car',
            location: 'Test Location',
            time: '2025-12-01T10:00:00.000Z',
            price: 100,
            gender: 'male',
            totalSeats: 3
        };
        const response = await request(app)
            .post('/carpools')
            .set('Cookie', `token=${userToken}`)
            .send(mockCarpool);
        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe('/');
    });
});