const express = require('express');
const router  = express.Router();
const path = require('path');
const { Room, Department, Employee, Reservation } = require('../models');

router.use(express.json());

// ── SSE client registry ───────────────────────────────────
// Map of roomId (string) -> Set of sender functions
const sseClients = new Map();

function getClients(roomId) {
  if (!sseClients.has(roomId)) sseClients.set(roomId, new Set());
  return sseClients.get(roomId);
}

function pushToRoom(roomId, event, payload) {
  const clients = sseClients.get(String(roomId));
  if (!clients || clients.size === 0) return;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach(send => send(data));
}

// ── GET / ───────────────────────────────────────────────
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/reservations', 'index.html'));
});

// ── GET /signage ────────────────────────────────────────
router.get(['/signage', '/signage.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/reservations', 'signage.html'));
});

// Serve other static files (CSS, etc.) from public if needed
router.use(express.static(path.join(__dirname, '../public')));

// ── GET /api/masters ─────────────────────────────────────
router.get('/api/masters', async (req, res) => {
  try {
    const rooms = await Room.findAll();
    const departments = await Department.findAll({
      include: [{ model: Employee, as: 'employees' }]
    });
    res.json({ rooms, departments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reservations?date=YYYY-MM-DD&roomId=1 ───────────
router.get('/api/reservations', async (req, res) => {
  const { date, roomId } = req.query;
  const where = {};
  if (date) where.date = date;
  if (roomId) where.roomId = roomId;

  try {
    const rows = await Reservation.findAll({
      where,
      include: [
        { model: Employee, as: 'reservingEmployee', include: [{ model: Department, as: 'department' }] },
        { model: Employee, as: 'registeredBy' },
        { model: Room,     as: 'room' },
      ],
      order: [['startTime', 'ASC']],
    });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/reservations error:', err);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

// ── POST /api/reservations ────────────────────────────────────
router.post('/api/reservations', async (req, res) => {
  const { roomId, date, startTime, endTime, reservingEmployeeId, registeredByUserId } = req.body;

  if (!roomId || !date || !startTime || !endTime || !reservingEmployeeId || !registeredByUserId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const reservation = await Reservation.create({
      roomId,
      date,
      startTime,
      endTime,
      reservingEmployeeId,
      registeredByUserId,
      registeredAt: new Date(),
    });
    const full = await Reservation.findByPk(reservation.id, {
      include: [
        { model: Employee, as: 'reservingEmployee', include: [{ model: Department, as: 'department' }] },
        { model: Employee, as: 'registeredBy' },
        { model: Room,     as: 'room' },
      ],
    });

    // Push to the signage screen for this room only
    pushToRoom(roomId, 'reservation:created', full);

    res.status(201).json(full);
  } catch (err) {
    console.error('POST /api/reservations error:', err);
    res.status(500).json({ error: 'Failed to create reservation' });
  }
});

// ── DELETE /api/reservations/:id ──────────────────────────────
router.delete('/api/reservations/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const reservation = await Reservation.findByPk(id);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    const roomId = reservation.roomId;
    await reservation.destroy();

    // Push to the signage screen for this room only
    pushToRoom(roomId, 'reservation:deleted', { id });

    res.json({ deleted: id });
  } catch (err) {
    console.error('DELETE /api/reservations/:id error:', err);
    res.status(500).json({ error: 'Failed to delete reservation' });
  }
});

// ── GET /api/events?room=1 ────────────────────────────────────
router.get('/api/events', (req, res) => {
  const roomId = String(req.query.room);
  if (!roomId) return res.status(400).send('room query parameter required');

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(data);

  getClients(roomId).add(send);
  console.log(`SSE client connected: room ${roomId} (${getClients(roomId).size} total)`);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);

  req.on('close', () => {
    getClients(roomId).delete(send);
    clearInterval(heartbeat);
    console.log(`SSE client disconnected: room ${roomId} (${getClients(roomId).size} remaining)`);
  });
});

module.exports = router;