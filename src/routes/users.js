import express from 'express';
const router = express.Router();
import pool from "../config/db.js";


router.post('/add', async (req, res) => {
    const { name, email, role, password } = req.body;
    try {
        if (!name || !email || !role || !password) {
            return res.status(400).json({ error: 'all fields are required' });
        }

        if (role !== 'teacher') {
            return res.status(400).json({ error: "Only teacher roles are allowed" });
        }

        if (!['admin', 'teacher'].includes(role)) {
            return res.status(400).json({ error: 'Role must be either teacher or admin' })
        }

        // Insert new user
        const query = `
    INSERT INTO users (name, email, role, password)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, role, created_at;
  `;
        const values = [name, email, role, password];
        const result = await pool.query(query, values);
        res.status(201).json({
            message: 'User added successfully',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('error adding user:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});

//delete the teacher for admin
router.delete('/delete/:id', async (req, res) => {
    console.log("Delete endpoint hit with ID:", req.params.id);
    const { id } = req.params;
    const adminRole = req.headers['x-admin-role'];
    try {
        if (!adminRole || adminRole !== 'admin') {
            return res.status(403).json({ error: "Only admins can delete the teachers" });

        }
        //checking the teacher exists
        const checkQuery = 'SELECT role FROM users WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [id]);
        if (checkResult.rows.length == 0) {
            return res.status(404).json({ error: "teacher not found" });
        }
        if (checkResult.rows[0].role !== 'teacher') {
            return res.status(400).json({ error: "only teachers can delete" });
        }

        const deleteQuery = 'DELETE FROM users WHERE id = $1 RETURNING *';
        const deleteResult = await pool.query(deleteQuery, [id]);
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'Teacher not found' });
        }
        return res.status(200).json({ message: "Deleted successfully" });
    } catch (error) {
        console.log('error deleting the user', error);
        return res.status(500).json({ error: "Internal server Error" });
    }
});

//fetch teachers
router.get('/teachers', async (req, res) => {
    try {
        const query = 'SELECT id, name, email, created_at FROM users WHERE role = $1';
        const result = await pool.query(query, ['teacher']);
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('error fetching teachers:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;