const form = document.getElementById('registrationForm');
const fullNameInput = document.getElementById('fullName');
const studentNumberInput = document.getElementById('studentNumber');
const emailInput = document.getElementById('email');
const successMessage = document.getElementById('successMessage');

function showError(input, message) {
  const errorId = input.id + 'Error';
  const errorElement = document.getElementById(errorId);

  errorElement.textContent = message;
  input.classList.add('invalid');
}

function clearError(input) {
  const errorId = input.id + 'Error';
  const errorElement = document.getElementById(errorId);

  errorElement.textContent = '';
  input.classList.remove('invalid');
}

fullNameInput.addEventListener('input', () => {
  if (fullNameInput.value.trim() === '') {
    showError(fullNameInput, 'Please enter your full name.');
  } else {
    clearError(fullNameInput);
  }
});

studentNumberInput.addEventListener('input', () => {
  const numericOnly = studentNumberInput.value.replace(/\D/g, '');
  studentNumberInput.value = numericOnly.slice(0, 6);

  if (!/^\d{6}$/.test(studentNumberInput.value)) {
    showError(studentNumberInput, 'Student number must be exactly 6 digits.');
  } else {
    clearError(studentNumberInput);
  }
});

emailInput.addEventListener('input', () => {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(emailInput.value.trim())) {
    showError(emailInput, 'Please enter a valid email address.');
  } else {
    clearError(emailInput);
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  let valid = true;

  if (fullNameInput.value.trim() === '') {
    showError(fullNameInput, 'Please enter your full name.');
    valid = false;
  } else {
    clearError(fullNameInput);
  }

  if (!/^\d{6}$/.test(studentNumberInput.value)) {
    showError(studentNumberInput, 'Student number must be exactly 6 digits.');
    valid = false;
  } else {
    clearError(studentNumberInput);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(emailInput.value.trim())) {
    showError(emailInput, 'Please enter a valid email address.');
    valid = false;
  } else {
    clearError(emailInput);
  }

  if (valid) {
    successMessage.textContent = 'Registration successful!';
    form.reset();
  } else {
    successMessage.textContent = '';
  }
});
