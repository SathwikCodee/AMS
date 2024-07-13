const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const admin = require('firebase-admin');
const serviceAccount = require('./key.json');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const secret = crypto.randomBytes(64).toString('hex');
const app = express();
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
app.set('view engine', 'ejs');

// Serve static files from the "public" directory
app.use(express.static(__dirname + '/public'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize the session middleware
app.use(session({
  secret: secret,
  resave: false,
  saveUninitialized: true,
}));

// Root route
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/welcome.html');
});

// Signup route
app.get('/signup', function (req, res) {
  res.render('signup', { message: null });
});

// Login route (GET request)
app.get('/login', function (req, res) {
  res.render('login', { message: null });
});



// Welcome route
app.get('/welcome', function (req, res) {
  res.sendFile(__dirname + '/public/welcome.html');
});

// Signup form submission route
app.post('/onSignup', function (req, res) {
    const data = req.body;
    const email = req.body.email;
    const password = req.body.password;
  
    // Hash the user's password using bcrypt
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error("Error hashing password:", err);
        res.render('signup', { message: "An error occurred while signing up." });
      } else {
        // Replace the plain text password with the hashed password
        data.password = hashedPassword;
  
        // Check if the email already exists in the database
        db.collection('userData').where("email", "==", email).get()
          .then(querySnapshot => {
            if (!querySnapshot.empty) {
              res.render('signup', { message: "Email already exists. Please choose a different email." });
            } else {
              // Add the user's data to the database
              db.collection('userData').add(data)
                .then(() => {
                  res.render('signup', { message: "Successfully signed up!" });
                })
                .catch(error => {
                  console.error("Error adding data:", error);
                  res.render('signup', { message: "An error occurred while signing up." });
                });
            }
          })
          .catch(error => {
            console.error("Error checking email:", error);
            res.render('signup', { message: "An error occurred while signing up." });
          });
      }
    });
  });

app.post('/onLogin', function (req, res) {
  const email = req.body.email;
  const password = req.body.password;

  db.collection('userData')
    .where("email", "==", email)
    .get()
    .then(querySnapshot => {
      if (!querySnapshot.empty) {
        const data = querySnapshot.docs[0].data();
        const hashedPassword = data.password;
        bcrypt.compare(password, hashedPassword, (err, result) => {
          if (result) {
            const name = data.name;
            req.session.username = name;
            res.redirect('/dashboard'); // Redirect to the dashboard route
          } else {
            res.render('login', { message: "Invalid email or password!" });
          }
        });
      } else {
        res.render('login', { message: "Invalid email or password!" });
      }
    })
    .catch(error => {
      console.error("Error checking login:", error);
      res.render('login', { message: "An error occurred while checking login." });
    });
});

app.get('/dashboard', isAuthenticated, function (req, res) {
      res.render('dashboard', { username: req.session.username, message: null });
    });
function isAuthenticated(req, res, next) {
    if (req.session && req.session.username) {
      return next();
    } else {
      res.render('login', { message: "not logged in" });
    }
  }
  app.get('/generator',isAuthenticated ,function (req, res) {
    res.sendFile(__dirname + '/public/generator.html');
  });
  
  // Scanner route
  app.get('/scanner', isAuthenticated,function (req, res) {
    res.sendFile(__dirname + '/public/code.html');
  });

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0'); // January is 0!
  const yyyy = date.getFullYear();
  return dd + mm + yyyy;
}
app.post('/regroll', isAuthenticated,(req, res) => {
  const rollNumber = req.body.rollNumber;
  if (!rollNumber) {
    return res.status(400).send('<script>alert("Roll number is required"); window.location.href = "/generator";</script>');
  }

  const regDocRef = db.collection('reg').doc('ece');

  regDocRef.get()
    .then(docSnapshot => {
      if (docSnapshot.exists) {
        const rollNumbers = docSnapshot.data().rollNumbers || [];
        if (rollNumbers.includes(rollNumber)) {
          return res.status(200).send('<script>alert("Roll number already exists"); window.location.href = "/generator";</script>');
        } else {
          rollNumbers.push(rollNumber);
          regDocRef.update({ rollNumbers: rollNumbers })
            .catch(error => {
              console.error('Error adding Roll Number:', error);
              return res.status(500).send('<script>alert("An error occurred while registering the roll number"); window.location.href = "/generator";</script>');
            });
        }
      } else {
        regDocRef.set({ rollNumbers: [rollNumber] })
          .then(() => {
            console.log("Successfully Registered")
          })
          .catch(error => {
            console.error('Error saving Roll Number:', error);
            return res.status(500).send('<script>alert("An error occurred while registering the roll number"); window.location.href = "/generator";</script>');
          });
      }
    })
    .catch(error => {
      console.error('Error checking document:', error);
      return res.status(500).send('<script>alert("Internal Server Error"); window.location.href = "/generator";</script>');
    });
});


// Endpoint to handle QR code data
app.post('/uploadQRCodeData', (req, res) => {
  const { qrCodeData } = req.body;

  // Verify if qrCodeData exists in the 'reg' collection under the 'ece' document
  const regDocRef = db.collection('reg').doc('ece');
  regDocRef
    .get()
    .then((regDocSnapshot) => {
      if (regDocSnapshot.exists) {
        const rollNumbers = regDocSnapshot.data().rollNumbers || [];
        if (rollNumbers.includes(qrCodeData)) {
          // QR code data exists in the 'reg' collection
          // You can add it to the date document here
          addQRCodeDataToDocument(qrCodeData);
        } else {
          console.log('QR code data does not exist in the reg collection.');
          res.status(200).send('QR Code Data not found in the reg collection.');
        }
      } else {
        console.log('Document "ece" not found in the "reg" collection.');
        res.status(404).send('Document "ece" not found in the "reg" collection.');
      }
    })
    .catch((error) => {
      console.error('Error checking the reg collection:', error);
      res.status(500).send('Internal Server Error');
    });

  function addQRCodeDataToDocument(qrCodeData) {
    const dateObject = new Date();
    const formattedDate = formatDate(dateObject);

    // Create a reference to the date document
    const dateDocRef = db.collection('data').doc(formattedDate);

    // Check if the roll number already exists in the date document
    // Check if the roll number already exists in the date document
    dateDocRef.get()
    .then((docSnapshot) => {
        if (docSnapshot.exists) {
            // Document exists, check if the roll number exists
            const rollNumbers = docSnapshot.data().rollNumbers || [];

            if (rollNumbers.includes(qrCodeData)) {
                console.log('QR Code Data already exists in the document.');
                res.status(200).send('QR Code Data already exists in the document.');
            } else {
                // Add the roll number to the array
                rollNumbers.push(qrCodeData);
                dateDocRef.update({ rollNumbers: rollNumbers })
                    .then(() => {
                        console.log('QR Code Data added to the document.');
                        res.status(200).send('QR Code Data added to the document.');
                    })
                    .catch((error) => {
                        console.error('Error adding QR Code Data:', error);
                        res.status(500).send('Internal Server Error');
                    });
            }
        } else {
            // Document does not exist, create it with the roll number
            dateDocRef.set({ rollNumbers: [qrCodeData] })
                .then(() => {
                    console.log('QR Code Data saved to Firebase with document name:', formattedDate);
                    res.status(200).send('QR Code Data saved to Firebase.');
                })
                .catch((error) => {
                    console.error('Error saving QR Code Data:', error);
                    res.status(500).send('Internal Server Error');
                });
        }
    })
    .catch((error) => {
        console.error('Error checking the date document:', error);
        res.status(500).send('Internal Server Error');
    });

  }
});

app.get('/getRollNumbers/:date',isAuthenticated, (req, res) => {
    const dAte = req.params.date; 
    const date = dAte.split('-').reverse().join('');// Extract the date from the request parameters
    const db = admin.firestore();

    // Reference to the date document in the 'data' collection
    const dateDocRef = db.collection('data').doc(date);

    console.log('Fetching roll numbers for date:', date);

    dateDocRef.get()
        .then((docSnapshot) => {
            if (docSnapshot.exists) {
                const data = docSnapshot.data();
                if (data.rollNumbers && Array.isArray(data.rollNumbers)) {
                    const rollNumbers = data.rollNumbers;
                    console.log('Fetched roll numbers:', rollNumbers);
                    res.status(200).json({ date, rollNumbers });
                } else {
                    console.log('No roll numbers found for date:', date);
                    res.status(200).json({ date, rollNumbers: [] }); // Empty array if no roll numbers
                }
            } else {
                console.log('Date document not found for date:', date);
                res.status(404).send('Date document not found');
            }
        })
        .catch((error) => {
            console.error('Error retrieving roll numbers:', error);
            res.status(500).send('Internal Server Error');
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});