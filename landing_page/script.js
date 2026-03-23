document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const loginModal = document.getElementById('loginModal');
    const navLoginBtn = document.getElementById('navLoginBtn');
    const heroLoginBtn = document.getElementById('heroLoginBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalBackdrop = document.getElementById('modalBackdrop');
    
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('submitLoginBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loader = submitBtn.querySelector('.loader');
    const errorToast = document.getElementById('loginError');
    const errorText = document.getElementById('errorText');

    // Open/Close logic
    const openModal = () => {
        loginModal.classList.add('active');
        usernameInput.focus();
        errorToast.style.display = 'none';
        loginForm.reset();
    };

    const closeModal = () => {
        loginModal.classList.remove('active');
    };

    navLoginBtn.addEventListener('click', openModal);
    heroLoginBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && loginModal.classList.contains('active')) {
            closeModal();
        }
    });

    // Form Submission Logic
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        // Hide error
        errorToast.style.display = 'none';
        
        // Validation
        if(!username || !password) {
            errorText.textContent = 'Hardware token or ID missing. Please provide full credentials.';
            errorToast.style.display = 'flex';
            return;
        }

        // Simulate Loading State connecting to the neural net
        btnText.style.display = 'none';
        loader.style.display = 'block';
        submitBtn.disabled = true;

        setTimeout(() => {
            btnText.style.display = 'block';
            loader.style.display = 'none';
            submitBtn.disabled = false;
            
            // Dummy logic to make it look real - fail initially to show error styling
            if(username.toLowerCase() !== 'admin') {
                errorText.textContent = 'Unauthorized clearance level for operator ID: ' + username;
                errorToast.style.display = 'flex';
                
                // Shake effect on modal
                const card = document.querySelector('.modal-card');
                card.style.transform = 'translate(5px, 0)';
                setTimeout(() => card.style.transform = 'translate(-5px, 0)', 100);
                setTimeout(() => card.style.transform = 'translate(5px, 0)', 200);
                setTimeout(() => card.style.transform = 'translate(0, 0)', 300);
            } else {
                // Success Scenario
                submitBtn.innerHTML = 'Clearance Vetted - Redirecting...';
                submitBtn.style.background = 'var(--green)';
                submitBtn.style.boxShadow = '0 0 20px rgba(0,255,136,0.6)';
                
                // Close modal and indicate success
                setTimeout(() => {
                    closeModal();
                    // Optional redirect logic would go here
                    // window.location.href = '../frontend/dist/index.html'; 
                }, 1500);
            }
        }, 1200); // Fake latency
    });
});
