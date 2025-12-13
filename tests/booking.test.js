// tests/booking.test.js
const request = require('supertest');
const { app } = require('../app');
const db = require('./db_setup');
const User = require('../models/User');
const Carpool = require('../models/Carpool');
const jwt = require('jsonwebtoken');

let driver;
let passenger;
let passengerToken;
let offer;

beforeAll(async () => await db.connect());
beforeEach(async () => {
  await db.clearDatabase();
  driver = await User.create({ name: 'Driver', email: 'driver@example.com', password: 'secret' });
  passenger = await User.create({ name: 'Passenger', email: 'pass@example.com', password: 'secret' });
  passengerToken = jwt.sign({ id: passenger._id, role: passenger.role, name: passenger.name, email: passenger.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  offer = await Carpool.create({ userId: driver._id, carName: 'Sedan', location: 'Campus', time: new Date().toISOString(), price: 50, gender: 'any', totalSeats: 2, bookedSeats: 0, bookedBy: [] });
});
afterAll(async () => await db.closeDatabase());

describe('Booking Flow', () => {
  it('prevents booking own offer', async () => {
    const driverToken = jwt.sign({ id: driver._id, role: driver.role, name: driver.name, email: driver.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app)
      .post(`/carpools/${offer._id}/book`)
      .set('Cookie', `token=${driverToken}`)
      .send({ seats: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.text).toContain('You cannot book your own offer.');
  });

  it('books available seats and redirects home', async () => {
    const res = await request(app)
      .post(`/carpools/${offer._id}/book`)
      .set('Cookie', `token=${passengerToken}`)
      .send({ seats: 1 });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');

    const updated = await Carpool.findById(offer._id);
    expect(updated.bookedSeats).toBe(1);
    expect(updated.bookedBy.length).toBe(1);
    expect(String(updated.bookedBy[0].user)).toBe(String(passenger._id));
  });

  it('rejects overbooking more than available seats', async () => {
    await Carpool.findByIdAndUpdate(offer._id, { $set: { bookedSeats: 2 } });
    const res = await request(app)
      .post(`/carpools/${offer._id}/book`)
      .set('Cookie', `token=${passengerToken}`)
      .send({ seats: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.text).toContain('Only 0 seat(s) available.');
  });
});
