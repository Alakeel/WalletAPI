module.exports = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).send('Unauthorized');
  }

  // Implement your token verification logic here
  const authorized = verifyToken(token); // Replace with actual token verification logic

  if (authorized) {
    next();
  } else {
    res.status(403).send('Forbidden');
  }
};

function verifyToken(token) {
  // Dummy token verification function
  return token === 'valid-token'; // Replace with actual token verification logic
}
