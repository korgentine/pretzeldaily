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
    // Debug message to confirm initialization
    console.log('App initializing...');
    
    // Set up the date
    updateDateDisplay();
    
    // Generate a unique device ID if not exists
    deviceId = localStorage.getItem('pretzelDayDeviceId');
    if (!deviceId) {
        deviceId = generateDeviceId();
        localStorage.setItem('pretzelDayDeviceId', deviceId);
    }
    console.log('Device ID:', deviceId);
    
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
    
    // Check Firebase availability
    if (typeof firebase !== 'undefined') {
        console.log('Firebase is available');
        
        // Set up Firebase real-time listener
        setupFirebaseListener();
    } else {
        console.warn('Firebase is NOT available - using local storage only');
        loadFallbackLogs();
    }
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed', err));
    }
    
    // Disable log button initially
    logButton.disabled = true;
    
    // Set up midnight refresh
    setupMidnightRefresh();
    
    console.log('App initialization complete');
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
        dateString: formatDateForStorage(timestamp),
        deviceId: deviceId,
        id: 'log_' + timestamp.getTime() + '_' + Math.random().toString(36).substring(2, 9)
    };
    
    console.log('Logging activity:', logEntry);
    
    // Add to Firebase
    saveLogToFirebase(logEntry);
    
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
    // Sort logs by timestamp (oldest first)
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
        sortedLogs.forEach((log) => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.dataset.id = log.id || '';
            
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
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '&times;';
            deleteButton.addEventListener('click', () => deleteLogEntry(log));
            
            logEntry.appendChild(timePersonContainer);
            logEntry.appendChild(activitiesElement);
            logEntry.appendChild(deleteButton);
            
            activitiesLogElement.appendChild(logEntry);
        });
    }
}

// Delete a log entry
function deleteLogEntry(logToDelete) {
    console.log('Deleting log entry:', logToDelete);
    
    // Remove from local array
    todayLogs = todayLogs.filter(log => log.id !== logToDelete.id);
    
    // Update UI
    updateLogsDisplay();
    
    // Update local storage
    saveFallbackLogs();
    
    // Delete from Firebase
    deleteFromFirebase(logToDelete);
}

// Firebase Realtime Database functions
function saveLogToFirebase(logEntry) {
    try {
        console.log('Saving to Firebase Realtime Database...');
        if (typeof firebase === 'undefined') {
            console.warn('Firebase not available');
            return;
        }
        
        // Get a reference to the logs location
        const today = formatDateForStorage(new Date());
        const database = firebase.database();
        const logsRef = database.ref('logs/' + today);
        
        // Generate a unique key for this log
        const newLogRef = logsRef.push();
        
        // Save the data
        newLogRef.set(logEntry)
            .then(() => {
                console.log('Data saved successfully with key:', newLogRef.key);
                // Store the Firebase key with the log entry
                logEntry.firebaseKey = newLogRef.key;
            })
            .catch(error => {
                console.error('Error saving data:', error);
            });
    } catch (error) {
        console.error('Error in saveLogToFirebase:', error);
    }
}

// Set up Firebase Realtime Database listener
function setupFirebaseListener() {
    try {
        console.log('Setting up Firebase Realtime Database listener...');
        const today = formatDateForStorage(new Date());
        const database = firebase.database();
        const logsRef = database.ref('logs/' + today);
        
        // Listen for data changes
        logsRef.on('value', (snapshot) => {
            console.log('Firebase update received');
            
            // Clear current logs
            todayLogs = [];
            
            // Get all the data
            const data = snapshot.val();
            if (data) {
                // Convert the object of objects to an array
                Object.keys(data).forEach(key => {
                    todayLogs.push({
                        ...data[key],
                        firebaseKey: key // Save the Firebase key for deletion
                    });
                });
                
                console.log('Loaded', todayLogs.length, 'logs from Firebase');
                updateLogsDisplay();
                saveFallbackLogs();
            } else {
                console.log('No data in Firebase');
                updateLogsDisplay();
            }
        }, (error) => {
            console.error('Firebase listener error:', error);
        });
            
        console.log('Firebase listener set up for date:', today);
    } catch (error) {
        console.error('Error setting up Firebase listener:', error);
    }
}

// Delete from Firebase Realtime Database
function deleteFromFirebase(logToDelete) {
    try {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase not available');
            return;
        }
        
        const today = formatDateForStorage(new Date());
        const database = firebase.database();
        
        // If we have a firebaseKey, use it for deletion
        if (logToDelete.firebaseKey) {
            console.log('Deleting from Firebase with key:', logToDelete.firebaseKey);
            
            const logRef = database.ref('logs/' + today + '/' + logToDelete.firebaseKey);
            logRef.remove()
                .then(() => {
                    console.log('Successfully deleted from Firebase');
                })
                .catch(error => {
                    console.error('Error deleting from Firebase:', error);
                });
        } 
        // Otherwise try to find by ID
        else if (logToDelete.id) {
            console.log('Searching for log to delete by ID:', logToDelete.id);
            
            const logsRef = database.ref('logs/' + today);
            logsRef.orderByChild('id').equalTo(logToDelete.id).once('value', snapshot => {
                if (snapshot.exists()) {
                    snapshot.forEach(childSnapshot => {
                        childSnapshot.ref.remove()
                            .then(() => {
                                console.log('Successfully deleted from Firebase by ID');
                            })
                            .catch(error => {
                                console.error('Error deleting from Firebase by ID:', error);
                            });
                    });
                } else {
                    console.warn('No matching log found in Firebase');
                }
            });
        }
    } catch (error) {
        console.error('Error in deleteFromFirebase:', error);
    }
}

// Local storage fallback functions
function saveFallbackLogs() {
    const storageKey = 'pretzelLogs_' + formatDateForStorage(new Date());
    localStorage.setItem(storageKey, JSON.stringify(todayLogs));
    console.log('Saved to local storage:', todayLogs.length, 'entries');
}

function loadFallbackLogs() {
    const storageKey = 'pretzelLogs_' + formatDateForStorage(new Date());
    const saved = localStorage.getItem(storageKey);
    if (saved) {
        try {
            todayLogs = JSON.parse(saved);
            console.log('Loaded from local storage:', todayLogs.length, 'entries');
            updateLogsDisplay();
        } catch (error) {
            console.error('Error parsing stored logs:', error);
            todayLogs = [];
        }
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
            
            // Set up a new Firebase listener for the new day
            setupFirebaseListener();
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