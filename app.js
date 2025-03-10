// DOM elements
const dateElement = document.getElementById('date');
const activitiesLogElement = document.getElementById('activities-log');
const emptyStateElement = document.getElementById('empty-state');
const personSelectElement = document.getElementById('person-select');
const activityButtons = document.querySelectorAll('.activity-button');
const logButton = document.getElementById('log-button');

// Application state
let selectedActivities = [];
let todayLogs = [];
let currentDate = new Date();
let deviceId = null;

// Activity icons for logs
const activityIcons = {
    'ate': 'images/ate.png',
    'peed': 'images/peed.png',
    'pood': 'images/pood.png',
    'ran': 'images/ran.png'
};

// Initialize the application
function init() {
    // Set up the date
    updateDateDisplay();
    
    // Generate a unique device ID if not exists
    deviceId = localStorage.getItem('pretzelDayDeviceId');
    if (!deviceId) {
        deviceId = generateDeviceId();
        localStorage.setItem('pretzelDayDeviceId', deviceId);
    }
    
    // Load the person preference from local storage
    const savedPerson = localStorage.getItem(`${deviceId}_selectedPerson`);
    if (savedPerson) {
        personSelectElement.value = savedPerson;
    }
    
    // Set up activity button clicks
    activityButtons.forEach(button => {
        button.addEventListener('click', () => {
            toggleActivity(button);
        });
    });
    
    // Set up the log button
    logButton.addEventListener('click', logActivities);
    
    // Save person selection to local storage
    personSelectElement.addEventListener('change', () => {
        localStorage.setItem(`${deviceId}_selectedPerson`, personSelectElement.value);
    });
    
    // Load today's logs from Firebase
    loadTodayLogs();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    }
    
    // Set up midnight refresh
    setupMidnightRefresh();
}

// Generate a simple device ID
function generateDeviceId() {
    return 'device_' + Math.random().toString(36).substring(2, 15);
}

// Update the date display
function updateDateDisplay() {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateString = currentDate.toLocaleDateString('en-US', options).toUpperCase();
    dateElement.textContent = dateString;
}

// Toggle activity selection
function toggleActivity(button) {
    const activity = button.dataset.activity;
    
    if (button.classList.contains('selected')) {
        button.classList.remove('selected');
        selectedActivities = selectedActivities.filter(a => a !== activity);
    } else {
        button.classList.add('selected');
        selectedActivities.push(activity);
    }
    
    // Enable/disable log button based on selection
    logButton.disabled = selectedActivities.length === 0;
}

// Log the selected activities
function logActivities() {
    if (selectedActivities.length === 0) return;
    
    const person = personSelectElement.value;
    const timestamp = new Date();
    const hours = timestamp.getHours().toString().padStart(2, '0');
    const minutes = timestamp.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;
    
    const logEntry = {
        time: timeString,
        person: person,
        activities: [...selectedActivities],
        timestamp: timestamp.getTime(),
        dateString: formatDateForStorage(timestamp)
    };
    
    // Add to local array
    todayLogs.push(logEntry);
    
    // Save to Firebase
    saveLogToFirebase(logEntry);
    
    // Update UI
    updateLogsDisplay();
    
    // Reset selection
    resetActivitySelection();
}

// Format date for storage (YYYY-MM-DD)
function formatDateForStorage(date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

// Reset the activity selection
function resetActivitySelection() {
    selectedActivities = [];
    activityButtons.forEach(button => {
        button.classList.remove('selected');
    });
    logButton.disabled = true;
}

// Update the logs display
function updateLogsDisplay() {
    // Sort logs by timestamp (newest first)
    const sortedLogs = [...todayLogs].sort((a, b) => a.timestamp - b.timestamp);
    
    // Clear current logs
    while (activitiesLogElement.firstChild) {
        activitiesLogElement.removeChild(activitiesLogElement.firstChild);
    }
    
    // Show or hide empty state
    if (sortedLogs.length === 0) {
        emptyStateElement.style.display = 'block';
        activitiesLogElement.appendChild(emptyStateElement);
    } else {
        emptyStateElement.style.display = 'none';
        
        // Add each log entry
        sortedLogs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            const timePersonContainer = document.createElement('div');
            timePersonContainer.className = 'log-time-person';
            
            const timeElement = document.createElement('div');
            timeElement.className = 'log-time';
            timeElement.textContent = log.time;
            
            const personElement = document.createElement('div');
            personElement.className = 'log-person';
            personElement.textContent = log.person;
            
            timePersonContainer.appendChild(timeElement);
            timePersonContainer.appendChild(personElement);
            
            const activitiesElement = document.createElement('div');
            activitiesElement.className = 'log-activities';
            
            log.activities.forEach(activity => {
                const activityIcon = document.createElement('div');
                activityIcon.className = 'log-activity-icon';
                activityIcon.style.backgroundImage = `url('${activityIcons[activity]}')`;
                activitiesElement.appendChild(activityIcon);
            });
            
            logEntry.appendChild(timePersonContainer);
            logEntry.appendChild(activitiesElement);
            
            activitiesLogElement.appendChild(logEntry);
        });
    }
}

// Firebase functions
function saveLogToFirebase(logEntry) {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        db.collection('pretzelLogs').add({
            ...logEntry,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            console.log('Log saved to Firebase');
        })
        .catch(error => {
            console.error('Error saving log to Firebase:', error);
            // Store locally if Firebase fails
            saveFallbackLogs();
        });
    } else {
        // If Firebase is not available, store locally
        saveFallbackLogs();
    }
}

function loadTodayLogs() {
    const today = formatDateForStorage(new Date());
    
    // Try to load from Firebase
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        db.collection('pretzelLogs')
            .where('dateString', '==', today)
            .orderBy('timestamp', 'asc')
            .get()
            .then(querySnapshot => {
                todayLogs = [];
                querySnapshot.forEach(doc => {
                    todayLogs.push(doc.data());
                });
                updateLogsDisplay();
            })
            .catch(error => {
                console.error('Error loading logs from Firebase:', error);
                // Load from local storage if Firebase fails
                loadFallbackLogs();
            });
    } else {
        // If Firebase is not available, load from local storage
        loadFallbackLogs();
    }
}

// Local storage fallback functions
function saveFallbackLogs() {
    localStorage.setItem('pretzelLogs_' + formatDateForStorage(new Date()), JSON.stringify(todayLogs));
}

function loadFallbackLogs() {
    const saved = localStorage.getItem('pretzelLogs_' + formatDateForStorage(new Date()));
    if (saved) {
        todayLogs = JSON.parse(saved);
        updateLogsDisplay();
    }
}

// Set up check for midnight to reset for a new day
function setupMidnightRefresh() {
    function checkForNewDay() {
        const now = new Date();
        // If it's a new day compared to our currentDate
        if (now.getDate() !== currentDate.getDate() || 
            now.getMonth() !== currentDate.getMonth() || 
            now.getFullYear() !== currentDate.getFullYear()) {
            
            // Update current date
            currentDate = now;
            updateDateDisplay();
            
            // Reset logs for the new day
            todayLogs = [];
            updateLogsDisplay();
            
            // Load today's logs (which should be empty for a new day)
            loadTodayLogs();
        }
        
        // Schedule the next check
        const msUntilNextCheck = 60000; // Check every minute
        setTimeout(checkForNewDay, msUntilNextCheck);
    }
    
    // Start checking
    checkForNewDay();
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);