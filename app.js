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
    
    // Set up relative time updates
    setupRelativeTimeUpdates();
    
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
    // Convert to 12-hour format with AM/PM
    const hours = timestamp.getHours();
    const minutes = timestamp.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12;
    const finalHours = displayHours === 0 ? 12 : displayHours;
    const timeString = `${finalHours}:${minutes} ${ampm}`;
    
    // Check if there's a recent log entry from the same person within 15 minutes of its ORIGINAL timestamp
    // Find the most recent log from the same person (search from the end)
    let mostRecentLogIndex = -1;
    for (let i = todayLogs.length - 1; i >= 0; i--) {
        if (todayLogs[i].person === person) {
            mostRecentLogIndex = i;
            break;
        }
    }
    
    let shouldMerge = false;
    if (mostRecentLogIndex !== -1) {
        const mostRecentLog = todayLogs[mostRecentLogIndex];
        
        // Only merge if this person's most recent log is the VERY LAST entry
        // (i.e., no one else has logged since then)
        const isLastEntry = mostRecentLogIndex === todayLogs.length - 1;
        
        if (isLastEntry) {
            // Use the current timestamp (which reflects any time edits) for merge decision
            const timeDifference = timestamp.getTime() - mostRecentLog.timestamp;
            const fifteenMinutesInMs = 15 * 60 * 1000;
            
            shouldMerge = timeDifference <= fifteenMinutesInMs;
            
            console.log(`Checking merge: Current time ${timeString}, Last entry time ${new Date(mostRecentLog.timestamp).toLocaleTimeString()}, Difference: ${Math.round(timeDifference/1000/60)} minutes, Is last entry: ${isLastEntry}, Should merge: ${shouldMerge}`);
        } else {
            console.log(`Not merging: Another person logged after ${person}'s last activity`);
        }
    }
    
    if (shouldMerge) {
        // Merge with existing log entry
        const existingLog = todayLogs[mostRecentLogIndex];
        
        // Add new activities to existing ones (allow duplicates)
        const mergedActivities = [...existingLog.activities, ...selectedActivities];
        
        // Update the existing log entry
        todayLogs[mostRecentLogIndex] = {
            ...existingLog,
            activities: mergedActivities,
            time: existingLog.time.includes('~') ? existingLog.time : existingLog.time + '~',
            lastUpdated: timestamp.getTime(),
            // Keep the original timestamp from the first activity in the group
            originalTimestamp: existingLog.originalTimestamp || existingLog.timestamp
        };
        
        console.log('Merged activities with existing log:', todayLogs[mostRecentLogIndex]);
        
        // Update UI
        updateLogsDisplay();
        
        // Update local storage
        saveFallbackLogs();
        
        // Update Firebase
        updateLogInFirebase(todayLogs[mostRecentLogIndex]);
    } else {
        // Create new log entry
        const logEntry = {
            time: timeString,
            person: person,
            activities: [...selectedActivities],
            timestamp: timestamp.getTime(),
            originalTimestamp: timestamp.getTime(), // Track when this group started
            dateString: formatDateForStorage(timestamp),
            deviceId: deviceId,
            id: 'log_' + timestamp.getTime() + '_' + Math.random().toString(36).substring(2, 9)
        };
        
        console.log('Logging new activity:', logEntry);
        
        // Add to Firebase
        saveLogToFirebase(logEntry);
    }
    
    // Reset selection
    resetActivitySelection();
}

// Format date for storage (YYYY-MM-DD)
function formatDateForStorage(date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

// Get relative time string (e.g., "3h 30m ago")
function getRelativeTime(timestamp) {
    const now = new Date().getTime();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (minutes < 1) {
        return 'just now';
    } else if (minutes < 60) {
        return `${minutes}m ago`;
    } else if (hours < 24) {
        if (remainingMinutes === 0) {
            return `${hours}h ago`;
        } else {
            return `${hours}h ${remainingMinutes}m ago`;
        }
    } else {
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
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
            
            const personElement = document.createElement('div');
            personElement.className = 'log-person';
            personElement.textContent = log.person;
            
            const timeElement = document.createElement('div');
            timeElement.className = 'log-time';
            // Ensure time is displayed in 12-hour format
            timeElement.textContent = ensureTimeFormat(log.time);
            timeElement.style.cursor = 'pointer';
            timeElement.addEventListener('click', () => openEditTimeModal(log));
            
            const relativeTimeElement = document.createElement('div');
            relativeTimeElement.className = 'log-relative-time';
            relativeTimeElement.textContent = getRelativeTime(log.timestamp);
            
            timePersonContainer.appendChild(personElement);
            timePersonContainer.appendChild(timeElement);
            timePersonContainer.appendChild(relativeTimeElement);
            
            const activitiesElement = document.createElement('div');
            activitiesElement.className = 'log-activities';
            
            log.activities.forEach(activity => {
                const activityContainer = document.createElement('div');
                activityContainer.className = 'activity-tile-container';
                
                const activityIcon = document.createElement('div');
                activityIcon.className = 'log-activity-icon';
                activityIcon.style.backgroundImage = `url('${activityIcons[activity]}')`;
                
                const deleteButton = document.createElement('button');
                deleteButton.className = 'activity-delete-button';
                deleteButton.innerHTML = '&times;';
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteActivity(log, activity);
                });
                
                activityContainer.appendChild(activityIcon);
                activityContainer.appendChild(deleteButton);
                activitiesElement.appendChild(activityContainer);
            });
            
            logEntry.appendChild(timePersonContainer);
            logEntry.appendChild(activitiesElement);
            
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

// Delete a specific activity from a log entry
function deleteActivity(logEntry, activityToDelete) {
    console.log('Deleting activity:', activityToDelete, 'from log:', logEntry);
    
    // Remove only the first instance of the activity from the log entry's activities array
    const updatedActivities = [...logEntry.activities];
    const activityIndex = updatedActivities.indexOf(activityToDelete);
    if (activityIndex !== -1) {
        updatedActivities.splice(activityIndex, 1);
    }
    
    // If no activities left, delete the entire log entry
    if (updatedActivities.length === 0) {
        deleteLogEntry(logEntry);
        return;
    }
    
    // Update the log entry with remaining activities
    const logIndex = todayLogs.findIndex(log => log.id === logEntry.id);
    if (logIndex !== -1) {
        todayLogs[logIndex].activities = updatedActivities;
        
        // Update UI
        updateLogsDisplay();
        
        // Update local storage
        saveFallbackLogs();
        
        // Update Firebase with the modified log entry
        updateLogInFirebase(todayLogs[logIndex]);
    }
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

// Update an existing log entry in Firebase
function updateLogInFirebase(logEntry) {
    try {
        console.log('Updating log in Firebase Realtime Database...');
        if (typeof firebase === 'undefined') {
            console.warn('Firebase not available');
            return;
        }
        
        const today = formatDateForStorage(new Date());
        const database = firebase.database();
        
        if (logEntry.firebaseKey) {
            console.log('Updating Firebase with key:', logEntry.firebaseKey);
            
            const logRef = database.ref('logs/' + today + '/' + logEntry.firebaseKey);
            logRef.update(logEntry)
                .then(() => {
                    console.log('Successfully updated log in Firebase');
                })
                .catch(error => {
                    console.error('Error updating log in Firebase:', error);
                });
        } else {
            console.warn('No Firebase key found for log entry, cannot update');
        }
    } catch (error) {
        console.error('Error in updateLogInFirebase:', error);
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

// Update relative times periodically
function setupRelativeTimeUpdates() {
    function updateRelativeTimes() {
        const logEntries = document.querySelectorAll('.log-entry');
        const sortedLogs = [...todayLogs].sort((a, b) => a.timestamp - b.timestamp);
        
        logEntries.forEach((logEntry, index) => {
            const relativeTimeElement = logEntry.querySelector('.log-relative-time');
            if (relativeTimeElement && sortedLogs[index]) {
                relativeTimeElement.textContent = getRelativeTime(sortedLogs[index].timestamp);
            }
        });
        
        // Update every minute
        setTimeout(updateRelativeTimes, 60000);
    }
    
    // Start updating
    updateRelativeTimes();
}

// Open edit time modal
function openEditTimeModal(logEntry) {
    // Create modal backdrop
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    
    const modalTitle = document.createElement('h2');
    modalTitle.textContent = 'EDIT TIME';
    modalTitle.className = 'modal-title';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', closeEditTimeModal);
    
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);
    
    // Modal body
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'time-input';
    // Convert from 12-hour to 24-hour format for the input
    const currentTime = logEntry.time.replace('~', '').trim();
    timeInput.value = convertTo24Hour(currentTime);
    
    modalBody.appendChild(timeInput);
    
    // Modal footer
    const modalFooter = document.createElement('div');
    modalFooter.className = 'modal-footer';
    
    const saveButton = document.createElement('button');
    saveButton.className = 'modal-save-button';
    saveButton.textContent = 'SAVE';
    saveButton.addEventListener('click', () => saveEditedTime(logEntry, timeInput.value));
    
    modalFooter.appendChild(saveButton);
    
    // Assemble modal
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modalBackdrop.appendChild(modalContent);
    
    // Add to DOM
    document.body.appendChild(modalBackdrop);
    
    // Focus on time input
    setTimeout(() => timeInput.focus(), 100);
    
    // Close on backdrop click
    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
            closeEditTimeModal();
        }
    });
}

// Close edit time modal
function closeEditTimeModal() {
    const modalBackdrop = document.querySelector('.modal-backdrop');
    if (modalBackdrop) {
        modalBackdrop.remove();
    }
}

// Convert 12-hour time to 24-hour format for input
function convertTo24Hour(time12h) {
    if (!time12h.includes('AM') && !time12h.includes('PM')) {
        return time12h; // Already 24-hour format
    }
    
    const [time, modifier] = time12h.split(' ');
    let [hours, minutes] = time.split(':');
    
    if (hours === '12') {
        hours = '00';
    }
    
    if (modifier === 'PM') {
        hours = parseInt(hours, 10) + 12;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// Convert 24-hour time to 12-hour format for display
function convertTo12Hour(time24h) {
    const [hours, minutes] = time24h.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12;
    const finalHours = displayHours === 0 ? 12 : displayHours;
    return `${finalHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Ensure time is in 12-hour format for display
function ensureTimeFormat(timeString) {
    if (!timeString) return timeString;
    
    // Check if it already has AM/PM
    if (timeString.includes('AM') || timeString.includes('PM')) {
        return timeString; // Already in 12-hour format
    }
    
    // Extract the tilde if present
    const hasTilde = timeString.includes('~');
    const cleanTime = timeString.replace('~', '');
    
    // Convert from 24-hour to 12-hour
    const convertedTime = convertTo12Hour(cleanTime);
    
    // Add tilde back if it was present
    return hasTilde ? convertedTime + '~' : convertedTime;
}

// Save edited time
function saveEditedTime(logEntry, newTime) {
    if (!newTime) return;
    
    // Parse the new time (24-hour format from input)
    const [hours, minutes] = newTime.split(':').map(Number);
    
    // Create new timestamp with today's date but new time
    const originalDate = new Date(logEntry.timestamp);
    const newDate = new Date(originalDate);
    newDate.setHours(hours, minutes, 0, 0);
    
    // Convert to 12-hour format for display
    const displayTime = convertTo12Hour(newTime);
    
    // Find the log entry in todayLogs array
    const logIndex = todayLogs.findIndex(log => log.id === logEntry.id);
    if (logIndex !== -1) {
        // Update the log entry
        todayLogs[logIndex] = {
            ...todayLogs[logIndex],
            time: logEntry.time.includes('~') ? displayTime + '~' : displayTime,
            timestamp: newDate.getTime(),
            originalTimestamp: logEntry.originalTimestamp || newDate.getTime() // Keep original if it exists
        };
        
        console.log('Updated time for log entry:', todayLogs[logIndex]);
        
        // Update UI
        updateLogsDisplay();
        
        // Update local storage
        saveFallbackLogs();
        
        // Update Firebase
        updateLogInFirebase(todayLogs[logIndex]);
    }
    
    // Close modal
    closeEditTimeModal();
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);