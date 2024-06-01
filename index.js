const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator');
const app = express();

app.use(bodyParser.json());


// MYSQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '12345',
    database: 'blog_app'
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('MYSQL connected successfully');
});

// query to generate user table
const createUserDataTable = `
CREATE TABLE IF NOT EXISTS user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(250) NOT NULL UNIQUE,
    password VARCHAR(250) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user'
)`;

db.query(createUserDataTable, (err) => {
    if (err) {
        throw err;
    }
    console.log('User table created successfully');
});

// query to generate post table
const createPostDataTable = `
CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(50) NOT NULL,
    content VARCHAR(250) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id)
)`;

db.query(createPostDataTable, (err) => {
    if (err) {
        throw err;
    }
    console.log('Posts table created successfully');
});

// query to generate comments table
const createCommentDataTable = `
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    content VARCHAR(250) NOT NULL,
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
)`;

db.query(createCommentDataTable, (err) => {
    if (err) {
        throw err;
    }
    console.log('Comments table created successfully');
});

// create session
app.use(session({
    secret: 'secrete-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
})
);

// Middleware to check if user is logged in 
function checkAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        return res.status(401).json({ errors: 'Unauthorized' });
    }
}

// Middleware to check if user is an admin
function checkAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        return res.status(401).json({ errors: 'Unauthorized' });
    }
}

// Registration route
app.post('/register', [
    check('username').notEmpty(),
    check('email').isEmail(),
    check('password').isLength({ min: 6 }),
    check('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Password confirmation does not match password');
        }
        return true;
    })
], async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const insertUserQuery = 'INSERT INTO user (username,email,password) VALUES (?,?,?)';
        db.query(insertUserQuery, [username, email, hashedPassword], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(201).json({
                message: 'User registered seccessfully'
            });
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ errors: 'Internal server error' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const getUserQuery = 'SELECT * FROM user WHERE email = ?';
    db.query(getUserQuery, [email], async (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (result.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        req.session.user = user;

        return res.status(200).json({ message: 'Login successfully' });
    });
});


// Logout route
app.post('/logout', async (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        res.status(200).json({ message: 'Loged Out' });
    });

});

// Dashboard route
app.get('/dashboard', checkAuth, (req, res) => {

    const page = parseInt(req.query.page) || 1;
    const limit = 5; // Number of post per page
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const getPostQuery = `
    SELECT * FROM posts
    WHERE user_id = ? AND title LIKE ?
    LIMIT ? OFFSET ?`;

    db.query(getPostQuery, [req.session.user.id, `%${search}%`, limit, offset], (err, results) => {
        if (err) {
            return res.status(500), json({ error: 'Internal Server Error' });
        }

        const countPostQuery = 'SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND title LIKE ?';
        db.query(countPostQuery, [req.session.user.id, `%${search}%`], (err, countResult) => {
            if (err) {
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            const totalPosts = countResult[0].count;
            const totalPages = Math.ceil(totalPosts / limit);

            return res.status(201).json(results);
        });
    })

});


// create post route
app.post('/posts', checkAuth, (req, res) => {
    const { title, content } = req.body;
    const insertPostQuery = 'INSERT INTO posts (title,content,user_id) VALUES (?,?,?)';
    db.query(insertPostQuery, [title, content, req.session.user.id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        return res.status(200).json({ message: 'Post created successfully' });
    });

});

// update post route
app.put('/posts/edit/:id', checkAuth, (req, res) => {
    const postId = req.params.id;
    const { title, content } = req.body;
    const updatePostQuery = 'UPDATE posts SET title = ? ,content = ? WHERE id = ? AND user_id = ?';
    db.query(updatePostQuery, [title, content, postId, req.session.user.id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        return res.status(200).json({ message: 'Post updated successfully' });
    });

});

// get post by id
app.get('/posts/:id', checkAuth, (req, res) => {
    const postId = req.params.id;
    const getPostQuery = 'SELECT * FROM posts WHERE id = ? AND user_id = ?';
    db.query(getPostQuery, [postId, req.session.user.id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (results.length === 0) {
            return res.status(401).json({ error: 'Post not found' });
        }
        return res.status(201).json(results);
    });

});

// get all posts
app.get('/posts', checkAuth, (req, res) => {
    const getPostQuery = 'SELECT * FROM posts WHERE  user_id = ?';
    db.query(getPostQuery, [req.session.user.id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (results.length === 0) {
            return res.status(401).json({ error: 'Post not found' });
        }
        return res.status(201).json(results);
    });

});

// Delete post
app.delete('/posts/delete/:post_id', checkAuth, (req, res) => {
    const postId = req.params.post_id;
    const deletePostQuery = 'DELETE FROM posts WHERE id = ? AND user_id = ?';
    db.query(deletePostQuery, [postId, req.session.user.id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        return res.status(200).json({ message: 'Post deleted successfully' });
    });
});

// create comment route
app.post('/comment/post/:id', checkAuth, (req, res) => {
    const postId = parseInt(req.params.id, 10); // Ensure postId is an integer
    const { content } = req.body;
    if (!content) {
        return res.status(400).json({ error: 'Content is required' });
    }

    // Check if post exists
    const checkPostQuery = 'SELECT * FROM posts WHERE id = ?';
    db.query(checkPostQuery, [postId], (err, postResults) => {
        if (err) {
            console.error('Error checking post:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (postResults.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const insertCommentQuery = 'INSERT INTO comments (content, user_id, post_id) VALUES (?, ?, ?)';
        db.query(insertCommentQuery, [content, req.session.user.id, postId], (err, result) => {
            if (err) {
                console.error('Error inserting comment:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(200).json({ message: 'Comment created successfully' });
        });
    });
});

// Get single post with comments

app.get('/comment/posts/:id', checkAuth, (req, res) => {
    const postId = parseInt(req.params.id, 10); // Ensure postId is an integer
    const getPostQuery = 'SELECT * FROM posts WHERE id = ?';
    db.query(getPostQuery, [postId], (err, postResults) => {
        if (err) {
            console.error('Error fetching post:', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (postResults.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const getCommentsQuery = `
            SELECT comments.*, user.username FROM comments
            JOIN user ON comments.user_id = user.id
            WHERE comments.post_id = ? ORDER BY comments.created_at DESC`;
        db.query(getCommentsQuery, [postId], (err, commentResults) => {
            if (err) {
                console.error('Error fetching comments:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(200).json({
                post: postResults[0],
                comments: commentResults
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`serveris running on port ${PORT}`);
});