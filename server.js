
// Import
const path = require('path')
const http = require('http')
const express = require('express')
const {Server} = require('socket.io')
const cookiesParser = require('cookie-parser')
const morgan = require('morgan')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

function requireHTTPS(req, res, next) {
        
    // The 'x-forwarded-proto' check is for Heroku
    if (!req.secure && req.get('x-forwarded-proto') !== 'https' && process.env.NODE_ENV !== "development" && req.hostname != 'localhost' && req.method == 'GET') {
        return res.redirect('https://' + req.get('host') + req.url);
    }

    next();
}

// Setup middlewares
app.use(morgan('dev'))
app.use(requireHTTPS)
app.use(express.urlencoded({extended:true}))
app.use(cookiesParser('topsecretcookie'))
app.use(express.static(path.join(__dirname,"public")))

let waitingUsers = []

app.get('/usersStatus', (req,res) => {
    res.json({status: `${0} usuários Online`})
})

io.on('connect', client => {

    // Try pairing this user with the ones currently waiting
    tryPair(client)
    
    // Clients emit this when they want to send a text message to their paired peer
    client.on('chat-message', (text) => {
        
        if(client.peer){
            const date = new Date().toLocaleDateString()
            text = text.trim()
            text = sanitize(text)
            
            if(text.length >= 2000){
                text = text.slice(0,2000)
                text += "..."
            }

            client.peer.emit('chat-message', {text,date})
        }

    })

    client.on('chat-audio', (audioData) => {
        if(client.peer){
            const date = new Date().toLocaleDateString()
            client.peer.emit('chat-audio', {audioData, date})
        }
    })

    client.on('chat-typing', () => {
        console.log('User started typing')
    })

    // Clients emit this when they want to get a new peer, even if they already have one
    client.on('next-peer', () => {
        if(client.peer){
            // Tell the paired user that they have been abandoned
            client.peer.emit('peer-abandoned')
            client.peer.peer = null
            client.peer = null
        }

        // Try pairing this user with the ones currently waiting
        tryPair(client)
    })

    // Clients emit this when they want to leave their 
    client.on('abandon-peer', () => {
        if(client.peer){
            client.peer.emit('peer-abandoned')
            client.peer.peer = null
            client.peer = null
        }

        waitingUsers = waitingUsers.filter(u => u.id != client.id)

    })

    client.on('disconnect', () => {

        if(client.peer){
            // Tell the user that the paired user has disconnected
            client.peer.emit('peer-lost')
            client.peer.peer = null
            client.peer = null
        }

        waitingUsers = waitingUsers.filter(u => u.id != client.id)

    })
})

function tryPair(client){
    if (waitingUsers.length <= 0) {
        waitingUsers.push(client)
    } else {

        client.peer = waitingUsers[0]
        waitingUsers[0].peer = client

        // Tell the users that they have been paired
        client.emit('peer-found')
        client.peer.emit('peer-found')

        // remove user from waiting list
        waitingUsers = waitingUsers.slice(1)
    }   
}

function sanitize(string) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return string.replace(reg, (match) => (map[match]));
}

// Create a node server and make it listen for connections on either port 3000 or the env port
const PORT = process.env["PORT"] || 3000
server.listen(PORT, () => console.log(`Server Started. Listening on port ${PORT}`))