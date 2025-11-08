// app.js

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // Import sqlite3
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const fs = require('fs');

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

// Set up storage engine for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Create a unique filename to avoid overwriting files
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });


const app = express();
const PORT = 3000;

// -- CONFIGURATION --
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs'); 
app.use(expressLayouts); // <-- ADD THIS
app.set('layout', 'layouts/main_layout');
app.use(express.static(path.join(__dirname, 'public')));
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// -- DATABASE SETUP --
const db = new sqlite3.Database('./data/database.sqlite', (err) => {
    if (err) {
        console.error("Error opening database", err.message);
    } else {
        console.log("Connected to the SQLite database.");
        
        db.run(`CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            phone TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error("Error creating clients table", err.message);
            } else {
                console.log("Clients table is ready.");
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clientId INTEGER NOT NULL,
            policyNumber TEXT NOT NULL,
            insurer TEXT NOT NULL,
            policyType TEXT,
            expiryDate DATE NOT NULL,
            FOREIGN KEY (clientId) REFERENCES clients (id)
        )`, (err) => {
            if (err) {
                console.error("Error creating policies table", err.message);
            } else {
                console.log("Policies table is ready.");
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error("Error creating reminders table", err.message);
            } else {
                console.log("Reminders table is ready.");
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clientId INTEGER NOT NULL,
            content TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (clientId) REFERENCES clients (id)
        )`, (err) => {
            if (err) console.error("Error creating notes table", err.message);
            else console.log("Notes table is ready.");
        });

        db.run(`CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clientId INTEGER NOT NULL,
            description TEXT NOT NULL,
            originalName TEXT NOT NULL,
            fileName TEXT NOT NULL,
            filePath TEXT NOT NULL,
            uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (clientId) REFERENCES clients (id)
        )`, (err) => {
            if (err) console.error("Error creating documents table", err.message);
            else console.log("Documents table is ready.");
        });
        
    }
});


// -- ROUTES --

// Homepage Dashboard
app.get('/', (req, res) => {
    // We'll run multiple queries and collect the results.
    const clientCountSql = "SELECT COUNT(id) as count FROM clients";
    const policyCountSql = "SELECT COUNT(id) as count FROM policies";
    const expiringCountSql = "SELECT COUNT(id) as count FROM policies WHERE expiryDate BETWEEN date('now') AND date('now', '+30 days')";
    const remindersSql = "SELECT * FROM reminders ORDER BY createdAt DESC LIMIT 5";

    // Nesting queries to gather all data before rendering
    db.get(clientCountSql, [], (err, clientRow) => {
        if (err) { return res.status(500).send("Database error."); }
        db.get(policyCountSql, [], (err, policyRow) => {
            if (err) { return res.status(500).send("Database error."); }
            db.get(expiringCountSql, [], (err, expiringRow) => {
                if (err) { return res.status(500).send("Database error."); }
                db.all(remindersSql, [], (err, reminders) => {
                    if (err) { return res.status(500).send("Database error."); }

                    res.render('dashboard', {
                        title: 'Dashboard',
                        data: {
                            clientCount: clientRow.count,
                            policyCount: policyRow.count,
                            expiringCount: expiringRow.count,
                            reminders: reminders
                        }
                    });
                });
            });
        });
    });
});

// -- CLIENT ROUTES --

// GET route to show the 'add new client' form
app.get('/clients/new', (req, res) => {
    res.render('client_form', { 
        title: 'Add New Client',
        data: { client: null } 
    });
});

// GET route to display all clients
app.get('/clients', (req, res) => {
    const sql = `
        SELECT 
            c.id, 
            c.name, 
            c.email, 
            c.phone, 
            (SELECT COUNT(id) FROM policies WHERE clientId = c.id) as policyCount 
        FROM clients c 
        ORDER BY c.name
    `;
    
    db.all(sql, [], (err, clients) => {
        if (err) {
            return res.status(500).send("Failed to retrieve clients.");
        }
        res.render('clients_list', { 
            title: 'All Clients', 
            data: { clients: clients }
        });
    });
});

// GET route for a single client's details page
app.get('/clients/:id', (req, res) => {
    const id = req.params.id;
    // (clientSql, policiesSql, notesSql definitions)
    const clientSql = "SELECT * FROM clients WHERE id = ?";
    const policiesSql = "SELECT * FROM policies WHERE clientId = ? ORDER BY expiryDate DESC";
    const notesSql = "SELECT * FROM notes WHERE clientId = ? ORDER BY createdAt DESC";
    const documentsSql = "SELECT * FROM documents WHERE clientId = ? ORDER BY uploadedAt DESC";

    db.get(clientSql, [id], (err, client) => {
        if (err || !client) { /* handle error */ return; }
        db.all(policiesSql, [id], (err, policies) => {
            if (err) { /* handle error */ return; }
            db.all(notesSql, [id], (err, notes) => {
                if (err) { /* handle error */ return; }
                db.all(documentsSql, [id], (err, documents) => {
                    if (err) { /* handle error */ return; }

                    res.render('client_details', {
                        title: 'Client Details',
                        data: { client, policies, notes, documents } // Add documents here
                    });
                });
            });
        });
    });
});

// GET route to show the edit form for a client
app.get('/clients/edit/:id', (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM clients WHERE id = ?";

    db.get(sql, [id], (err, client) => {
        if (err) {
            return res.status(500).send("Database error.");
        }
        if (client) {
            res.render('client_form', {
                title: 'Edit Client',
                data: { client: client }
            });
        } else {
            res.status(404).send("Client not found.");
        }
    });
});


// POST route to add a new policy for a client
app.post('/clients/:clientId/policies/add', (req, res) => {
    const { clientId } = req.params;
    const { policyNumber, insurer, policyType, expiryDate } = req.body;
    const sql = 'INSERT INTO policies (clientId, policyNumber, insurer, policyType, expiryDate) VALUES (?, ?, ?, ?, ?)';

    db.run(sql, [clientId, policyNumber, insurer, policyType, expiryDate], (err) => {
        if (err) {
            console.error("Error saving policy", err.message);
            return res.status(500).send("Failed to save policy.");
        }
        console.log(`New policy added for client ID: ${clientId}`);
        res.redirect(`/clients/${clientId}`);
    });
});


// POST route to handle the form submission
app.post('/clients/add', (req, res) => {
    const { name, email, phone } = req.body;
    const sql = 'INSERT INTO clients (name, email, phone) VALUES (?, ?, ?)';

    db.run(sql, [name, email, phone], function(err) {
        if (err) {
            console.error("Error inserting data", err.message);
            return res.status(500).send("Failed to save client.");
        }
        console.log(`A new client has been added with ID: ${this.lastID}`);
        res.redirect('/clients'); 
    });
});

// POST route to delete a client
app.post('/clients/delete/:id', (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM clients WHERE id = ?";

    db.run(sql, [id], (err) => {
        if (err) {
            console.error("Error deleting client", err.message);
            return res.status(500).send("Failed to delete client.");
        }
        console.log(`Client with ID ${id} has been deleted.`);
        res.redirect('/clients');
    });
});


// POST route to update a client's data
app.post('/clients/update/:id', (req, res) => {
    const id = req.params.id;
    const { name, email, phone } = req.body;
    const sql = `UPDATE clients SET name = ?, email = ?, phone = ? WHERE id = ?`;

    db.run(sql, [name, email, phone, id], (err) => {
        if (err) {
            console.error("Error updating client", err.message);
            return res.status(500).send("Failed to update client.");
        }
        res.redirect(`/clients/${id}`);
    });
});

// POST route to add a new note for a client
app.post('/clients/:clientId/notes/add', (req, res) => {
    const { clientId } = req.params;
    const { content } = req.body;
    const sql = 'INSERT INTO notes (clientId, content) VALUES (?, ?)';

    db.run(sql, [clientId, content], (err) => {
        if (err) { return res.status(500).send("Failed to save note."); }
        res.redirect(`/clients/${clientId}`);
    });
});

// POST route to handle document upload
app.post('/clients/:clientId/documents/upload', upload.single('document'), (req, res) => {
    const { clientId } = req.params;
    const { description } = req.body;
    // req.file is created by multer and contains file info
    const { originalname, filename, path } = req.file;

    const sql = `INSERT INTO documents (clientId, description, originalName, fileName, filePath) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [clientId, description, originalname, filename, path], (err) => {
        if (err) {
            console.error("Error saving document:", err.message);
            return res.status(500).send("Failed to save document.");
        }
        res.redirect(`/clients/${clientId}`);
    });
});


// -- SCHEDULER --
const cron = require('node-cron');

// Schedule a task to run every 20 seconds for testing
// In a real app, this would be '0 9 * * *' to run once every day at 9 AM
cron.schedule('*/20 * * * * *', () => {
    console.log('-------------------------------------');
    console.log('Running cron job: Checking for expiring policies...');
    
    const sql = `
        SELECT p.policyNumber, c.name as clientName
        FROM policies p
        JOIN clients c ON p.clientId = c.id
        WHERE p.expiryDate BETWEEN date('now') AND date('now', '+30 days')
    `;

    db.all(sql, [], (err, policies) => {
        if (err) {
            console.error("Cron job DB error:", err.message);
            return;
        }

        if (policies.length > 0) {
            const insertSql = 'INSERT INTO reminders (message) VALUES (?)';
            policies.forEach(policy => {
                const message = `Reminder: Policy #${policy.policyNumber} for client ${policy.clientName} is nearing expiration.`;
                // Insert reminder into the database
                db.run(insertSql, [message], (err) => {
                    if (err) console.error("Error saving reminder:", err.message);
                    else console.log(`Saved reminder: ${message}`);
                });
            });
        }
    });
});


// -- SERVER START --
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});