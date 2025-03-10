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
let firebaseListener = null; // Track the Firebase listener

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
    
    // Set up Firebase real-time listener
    setupFirebaseListener();
    
    // Also load from local storage as a backup
    loadFallbackLogs();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    }
    
    // Set up midnight refresh
    setupMidnightRefresh();
    
    // Disable log button initially
    logButton.disabled = true;
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
        deviceId: deviceId, // Add the device ID for tracking
        id: 'log_' + timestamp.getTime() + '_' + Math.random().toString(36).substring(2, 9) // Unique ID
    };
    
    // Save to Firebase - this will trigger the listener on all devices
    saveLogToFirebase(logEntry);
    
    // Also save to local storage as a backup
    saveFallbackLogs();
    
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
        sortedLogs.forEach((log, index) => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.dataset.index = index;
            logEntry.dataset.id = log.id || `log_${log.timestamp}_${index}`;
            
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
    // Remove from local array
    todayLogs = todayLogs.filter(log => 
        log.id !== logToDelete.id && 
        !(log.timestamp === logToDelete.timestamp && log.person === logToDelete.person)
    );
    
    // Delete from Firebase
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        
        // First try to find by ID
        if (logToDelete.id) {
            db.collection('pretzelLogs').where('id', '==', logToDelete.id)
                .get()
                .then(querySnapshot => {
                    if (!querySnapshot.empty) {
                        querySnapshot.forEach(doc => {
                            doc.ref.delete()
                                .then(() => console.log('Log deleted from Firebase by ID'))
                                .catch(error => console.error('Error deleting log from Firebase:', error));
                        });
                    } else {
                        // If not found by ID, try timestamp and person
                        deleteByTimestampAndPerson(db, logToDelete);
                    }
                })
                .catch(error => {
                    console.error('Error finding log to delete by ID:', error);
                    deleteByTimestampAndPerson(db, logToDelete);
                });
        } else {
            // If no ID, fall back to timestamp and person
            deleteByTimestampAndPerson(db, logToDelete);
        }
    }
    
    // Always update local storage
    saveFallbackLogs();
    
    // Update UI
    updateLogsDisplay();
}

// Helper function for deletion by timestamp and person
function deleteByTimestampAndPerson(db, logToDelete) {
    db.collection('pretzelLogs')
        .where('timestamp', '==', logToDelete.timestamp)
        .where('person', '==', logToDelete.person)
        .get()
        .then(querySnapshot => {
            querySnapshot.forEach(doc => {
                doc.ref.delete()
                    .then(() => console.log('Log deleted from Firebase by timestamp/person'))
                    .catch(error => console.error('Error deleting log from Firebase:', error));
            });
        })
        .catch(error => console.error('Error finding log to delete by timestamp/person:', error));
}

// Set up Firebase real-time listener
function setupFirebaseListener() {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        try {
            const today = formatDateForStorage(new Date());
            const db = firebase.firestore();
            
            // Cancel any existing listener
            if (firebaseListener) {
                firebaseListener();
                firebaseListener = null;
            }
            
            // Set up a real-time listener
            firebaseListener = db.collection('pretzelLogs')
                .where('dateString', '==', today)
                .onSnapshot(snapshot => {
                    console.log('Firebase update received');
                    let logsChanged = false;
                    
                    // Handle added or modified documents
                    snapshot.docChanges().forEach(change => {
                        const docData = change.doc.data();
                        
                        if (change.type === 'added' || change.type === 'modified') {
                            // Check if this log is already in our array
                            const existingIndex = todayLogs.findIndex(log => 
                                (log.id && log.id === docData.id) || 
                                (log.timestamp === docData.timestamp && log.person === docData.person)
                            );
                            
                            if (existingIndex === -1) {
                                todayLogs.push(docData);
                                logsChanged = true;
                            } else if (change.type === 'modified') {
                                todayLogs[existingIndex] = docData;
                                logsChanged = true;
                            }
                        }
                        
                        if (change.type === 'removed') {
                            // Remove from todayLogs if present
                            const existingIndex = todayLogs.findIndex(log => 
                                (log.id && log.id === docData.id) || 
                                (log.timestamp === docData.timestamp && log.person === docData.person)
                            );
                            
                            if (existingIndex !== -1) {
                                todayLogs.splice(existingIndex, 1);
                                logsChanged = true;
                            }
                        }
                    });
                    
                    if (logsChanged) {
                        // Update local storage with the latest data
                        saveFallbackLogs();
                        // Update UI
                        updateLogsDisplay();
                    }
                }, error => {
                    console.error('Firebase listener error:', error);
                });
                
            console.log('Firebase real-time listener set up');
        } catch (error) {
            console.error('Error setting up Firebase listener:', error);
        }
    }
}

// Firebase functions
function saveLogToFirebase(logEntry) {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        try {
            const db = firebase.firestore();
            db.collection('pretzelLogs').add({
                ...logEntry,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            })
            .then(() => {
                console.log('Log saved to Firebase successfully');
                // Note: We don't need to update the UI here because the listener will do it
            })
            .catch(error => {
                console.error('Error saving log to Firebase:', error);
            });
        } catch (error) {
            console.error('Firebase error:', error);
        }
    } else {
        console.log('Firebase not available, using local storage only');
        // If Firebase isn't available, we need to update the todayLogs array manually
        // (this is normally handled by the listener)
        if (!todayLogs.find(log => log.id === logEntry.id)) {
            todayLogs.push(logEntry);
            updateLogsDisplay();
        }
    }
}

// Local storage fallback functions
function saveFallbackLogs() {
    const storageKey = 'pretzelLogs_' + formatDateForStorage(new Date());
    localStorage.setItem(storageKey, JSON.stringify(todayLogs));
    console.log('Saved to local storage:', storageKey, todayLogs.length, 'entries');
}

function loadFallbackLogs() {
    const storageKey = 'pretzelLogs_' + formatDateForStorage(new Date());
    const saved = localStorage.getItem(storageKey);
    if (saved) {
        try {
            todayLogs = JSON.parse(saved);
            console.log('Loaded from local storage:', storageKey, todayLogs.length, 'entries');
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
            
            // Set up new Firebase listener for the new day
            setupFirebaseListener();
            
            // Load today's logs (which should be empty for a new day)
            loadFallbackLogs();
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