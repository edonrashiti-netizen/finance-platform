import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
	// Allow configuring CORS via environment variable. Defaults to reflecting request origin (true)
	const parseCorsOrigin = (value) => {
		if (!value || value === '*') return true;
		const list = value.split(',').map(s => s.trim()).filter(Boolean);
		return list.length <= 1 ? list[0] : list;
	};
	app.use(cors({ origin: parseCorsOrigin(process.env.CORS_ORIGIN), credentials: true }));
app.use(express.json());

// Persistent JSON database (lowdb) - no native build tools required
const adapter = new JSONFile(process.env.DB_PATH || './finance.json');
const db = new Low(adapter, { users: [], sellEntries: [], invoices: [], otherExpenses: [] });

// Seed default admin user if missing
const ensureAdminUserExists = async () => {
	await db.read();
	if (!db.data) db.data = { users: [], sellEntries: [] };
	
	const exists = db.data.users.find(u => u.username === 'admin');
	if (!exists) {
		const passwordHash = await bcrypt.hash('admin123', 10);
		db.data.users.push({
			id: 'admin_user',
			name: 'Admin',
			surname: 'User',
			description: 'Default administrator account',
			username: 'admin',
			passwordHash,
			createdAt: new Date().toISOString()
		});
		await db.write();
	}
};

// Initialize database
(async () => {
	try {
		await ensureAdminUserExists();
		console.log('Database initialized successfully');
	} catch (error) {
		console.error('Database initialization error:', error);
	}
})();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if (!token) {
		return res.sendStatus(401);
	}

	jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
		if (err) return res.sendStatus(403);
		req.user = user;
		next();
	});
};

// Root info endpoint
app.get('/', (req, res) => {
	res.send('Finance API is running. Try GET /api/health');
});

// Dev-only reset endpoint (clears DB and recreates admin)
app.post('/api/admin/reset', async (req, res) => {
	if (process.env.NODE_ENV === 'production') {
		return res.status(403).json({ error: 'Not allowed in production' });
	}
	try {
		db.data = { users: [], sellEntries: [], invoices: [], otherExpenses: [] };
		await ensureAdminUserExists();
		await db.write();
		res.json({ ok: true, message: 'Database cleared. Admin user recreated.' });
	} catch (e) {
		res.status(500).json({ error: 'Failed to reset', details: String(e) });
	}
});

// Auth routes
app.post('/api/register', async (req, res) => {
	try {
		const { name, surname, description, username, password } = req.body;
		
		if (!name || !surname || !username || !password) {
			return res.status(400).json({ error: 'All fields are required' });
		}

		await db.read();
		const exists = db.data.users.find(u => u.username === username);
		if (exists) {
			return res.status(400).json({ error: 'Username already exists' });
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const user = {
			id: `user_${Date.now()}`,
			name,
			surname,
			description: description || '',
			username,
			passwordHash: hashedPassword,
			createdAt: new Date().toISOString()
		};

		db.data.users.push(user);
		await db.write();
		
		res.status(201).json({ 
			message: 'User registered successfully',
			user: { id: user.id, name: user.name, surname: user.surname, username: user.username }
		});
	} catch (error) {
		console.error('Registration error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.post('/api/login', async (req, res) => {
	try {
		const { username, password } = req.body;
		
		if (!username || !password) {
			return res.status(400).json({ error: 'Username and password are required' });
		}

		await db.read();
		const user = db.data.users.find(u => u.username === username);
		if (!user) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		const validPassword = await bcrypt.compare(password, user.passwordHash);
		if (!validPassword) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		const token = jwt.sign(
			{ id: user.id, username: user.username },
			process.env.JWT_SECRET || 'fallback_secret',
			{ expiresIn: '24h' }
		);

		res.json({
			token,
			user: { id: user.id, name: user.name, surname: user.surname, username: user.username }
		});
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Sell entries routes
app.get('/api/sell-entries', authenticateToken, async (req, res) => {
	try {
		await db.read();
		res.json(db.data.sellEntries);
	} catch (error) {
		console.error('Get sell entries error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.post('/api/sell-entries', authenticateToken, async (req, res) => {
	try {
		const { id, date, type, description, amount, createdAt } = req.body;
		
		if (!id || !date || !type || !description || amount === undefined) {
			return res.status(400).json({ error: 'All fields are required' });
		}

		await db.read();
		const entry = {
			id,
			date,
			type,
			description,
			amount: parseFloat(amount),
			createdAt: createdAt || new Date().toISOString()
		};

		const idx = db.data.sellEntries.findIndex(e => e.id === id);
		if (idx >= 0) db.data.sellEntries[idx] = entry; else db.data.sellEntries.push(entry);
		await db.write();
		
		res.status(201).json({ message: 'Sell entry saved', entry });
	} catch (error) {
		console.error('Create sell entry error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Invoices upsert (create/update)
app.post('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const { id } = payload;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    await db.read();
    const idx = db.data.invoices.findIndex(i => i.id === id);
    if (idx >= 0) {
      db.data.invoices[idx] = { ...db.data.invoices[idx], ...payload };
    } else {
      db.data.invoices.push(payload);
    }
    await db.write();
    res.status(201).json({ message: 'Invoice saved', invoice: payload });
  } catch (error) {
    console.error('Upsert invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Other expenses upsert (create/update)
app.post('/api/other-expenses', authenticateToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const { id } = payload;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    await db.read();
    const idx = db.data.otherExpenses.findIndex(e => e.id === id);
    if (idx >= 0) {
      db.data.otherExpenses[idx] = { ...db.data.otherExpenses[idx], ...payload };
    } else {
      db.data.otherExpenses.push(payload);
    }
    await db.write();
    res.status(201).json({ message: 'Other expense saved', expense: payload });
  } catch (error) {
    console.error('Upsert other expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
	try {
		await db.read();
		res.json({ 
			status: 'ok', 
			timestamp: new Date().toISOString(),
			usersCount: db.data.users.length,
			sellEntriesCount: db.data.sellEntries.length
		});
	} catch (error) {
		res.status(500).json({ error: 'Database error', details: String(error) });
	}
});

// Optional static hosting for frontend if STATIC_DIR is set
// Ensure STATIC_DIR is absolute before using sendFile
{
	const staticDirEnv = process.env.STATIC_DIR;
	const staticDir = staticDirEnv ? (path.isAbsolute(staticDirEnv) ? staticDirEnv : path.resolve(staticDirEnv)) : null;
	if (staticDir) {
		app.use(express.static(staticDir));
		// Serve index.html for all non-API routes
		app.get(/^\/(?!api).*/, (req, res) => {
			res.sendFile(path.join(staticDir, 'index.html'));
		});
	}
}

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => {
	console.log(`Finance API listening on:`);
	console.log(`  Local: http://localhost:${port}`);
	console.log(`  Network: http://0.0.0.0:${port}`);
	console.log(`  (Use your PC's IP address from other devices)`);
	console.log(`  Health check: http://localhost:${port}/api/health`);
});


