// public/js/premium.js - Complete Premium Auction Platform

// ========== GLOBAL VARIABLES ==========
let socket;
let currentUser = null;
let currentToken = null;
let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentView = 'grid';
let bidsChart = null;
let categoriesChart = null;
let activityFeed = [];
let watchlist = [];
let notifications = [];
let allProducts = [];
let searchTimeout = null;

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initPreloader();
    checkAuth();
    setupEventListeners();
    connectSocket();
    setupKeyboardShortcuts();
    initCharts();
});

// Initialize Theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        document.getElementById('themeIcon')?.classList.replace('fa-moon', 'fa-sun');
    }
}

function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        document.getElementById('themeIcon')?.classList.replace('fa-sun', 'fa-moon');
        showToast('Light mode activated', 'info');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeIcon')?.classList.replace('fa-moon', 'fa-sun');
        showToast('Dark mode activated', 'info');
    }
}

// Preloader
function initPreloader() {
    setTimeout(() => {
        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500);
        }
    }, 2000);
}

// ========== AUTHENTICATION ==========
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        currentToken = token;
        currentUser = JSON.parse(user);
        showUserInterface();
        loadDashboardData();
        loadWatchlist();
        showPage('dashboard');
    } else {
        showPage('login');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    showLoading(true);
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentToken = data.token;
            currentUser = data.user;
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showUserInterface();
            loadDashboardData();
            loadWatchlist();
            showPage('dashboard');
            showToast(`Welcome back, ${data.user.name}! 🎉`, 'success');
            addActivityToFeed(`${data.user.name} logged in`, 'user');
        } else {
            showToast(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        showToast('Error logging in', 'error');
    }
    
    showLoading(false);
}

async function handleSignup(e) {
    e.preventDefault();
    showLoading(true);
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        showLoading(false);
        return;
    }
    
    try {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentToken = data.token;
            currentUser = data.user;
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showUserInterface();
            showPage('dashboard');
            showToast('Account created successfully! 🎉', 'success');
            addActivityToFeed(`${name} joined AuctionHub`, 'user');
        } else {
            showToast(data.message || 'Signup failed', 'error');
        }
    } catch (error) {
        showToast('Error creating account', 'error');
    }
    
    showLoading(false);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentToken = null;
    currentUser = null;
    showPage('login');
    showToast('Logged out successfully', 'success');
    if (socket) socket.disconnect();
}

function showUserInterface() {
    document.getElementById('authButtons').style.display = 'none';
    document.getElementById('userMenu').style.display = 'block';
    document.getElementById('dropdownUserName').textContent = currentUser.name;
    document.getElementById('dropdownUserEmail').textContent = currentUser.email;
    
    // Set avatar
    const avatarImg = document.getElementById('avatarImg');
    const emailHash = btoa(currentUser.email).substring(0, 10);
    avatarImg.src = `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=40`;
    
    document.getElementById('welcomeMessage').innerHTML = `Welcome back, ${currentUser.name}! <i class="fas fa-hand-peace"></i>`;
}

// ========== SOCKET.IO REAL-TIME ==========
function connectSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('🔌 Connected to real-time server');
        addActivityToFeed('Connected to live auction feed', 'system');
    });
    
    socket.on('new-bid', (data) => {
        console.log('💰 New bid:', data);
        
        // Add to activity feed
        addActivityToFeed(`${data.bidder.name} placed a bid of $${data.amount} on "${data.productName}"`, 'bid');
        
        // Show notification
        addNotification(`${data.bidder.name} bid $${data.amount} on ${data.productName}`, 'bid');
        
        // Show toast
        showToast(`💰 New bid: $${data.amount} by ${data.bidder.name}`, 'info');
        
        // Refresh current view
        const currentPage = getCurrentPage();
        if (currentPage === 'products') loadProducts();
        if (currentPage === 'dashboard') loadDashboardData();
        
        // Update modal if open
        const modal = document.getElementById('productModal');
        if (modal.style.display === 'block') {
            const productId = modal.getAttribute('data-product-id');
            if (productId === data.productId) {
                loadProductDetail(productId);
            }
        }
        
        // Update charts
        updateChart();
    });
    
    socket.on('auction-ended', (data) => {
        addActivityToFeed(`Auction ended: "${data.productName}" sold for $${data.finalPrice}`, 'product');
        addNotification(`Auction for "${data.productName}" has ended!`, 'info');
        showToast(`🏆 Auction ended: ${data.productName}`, 'info');
        loadProducts();
        loadDashboardData();
    });
    
    socket.on('new-product', (data) => {
        addActivityToFeed(`New auction listed: "${data.productName}" by ${data.sellerName}`, 'product');
        addNotification(`New item listed: ${data.productName}`, 'info');
        if (getCurrentPage() === 'products') loadProducts();
    });
}

// ========== DASHBOARD & ANALYTICS ==========
async function loadDashboardData() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/products', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            allProducts = data.data;
            
            // Update stats
            document.getElementById('totalProductsCount').textContent = data.data.filter(p => p.isActive).length;
            document.getElementById('watchingCount').textContent = watchlist.length;
            
            // Calculate total bids
            let totalBids = 0;
            data.data.forEach(product => {
                totalBids += product.bidCount || 0;
            });
            document.getElementById('totalBidsCount').textContent = totalBids;
            
            // Update top products
            displayTopProducts(data.data);
            
            // Update ending soon
            displayEndingSoon(data.data);
            
            // Update chart
            updateChartData(data.data);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function displayTopProducts(products) {
    const sorted = [...products].sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0)).slice(0, 5);
    const container = document.getElementById('topProductsList');
    
    container.innerHTML = sorted.map(product => `
        <div class="top-product-item" onclick="loadProductDetail('${product._id}')">
            <div class="top-product-rank">#${sorted.indexOf(product) + 1}</div>
            <div class="top-product-info">
                <div class="top-product-name">${escapeHtml(product.name)}</div>
                <div class="top-product-stats">
                    <span><i class="fas fa-gavel"></i> ${product.bidCount || 0} bids</span>
                    <span><i class="fas fa-dollar-sign"></i> $${product.currentPrice}</span>
                </div>
            </div>
            <div class="top-product-trend">
                <i class="fas fa-arrow-up trend-up"></i>
            </div>
        </div>
    `).join('');
}

function displayEndingSoon(products) {
    const now = new Date();
    const ending = products.filter(p => p.isActive && new Date(p.endTime) > now)
        .sort((a, b) => new Date(a.endTime) - new Date(b.endTime))
        .slice(0, 5);
    
    const container = document.getElementById('endingSoonList');
    
    container.innerHTML = ending.map(product => {
        const timeLeft = moment(product.endTime).fromNow();
        return `
            <div class="ending-soon-item" onclick="loadProductDetail('${product._id}')">
                <div class="ending-soon-name">${escapeHtml(product.name)}</div>
                <div class="ending-soon-time">
                    <i class="fas fa-clock"></i> ${timeLeft}
                </div>
                <div class="ending-soon-price">$${product.currentPrice}</div>
            </div>
        `;
    }).join('');
}

function initCharts() {
    const ctx = document.getElementById('bidsChart')?.getContext('2d');
    const catCtx = document.getElementById('categoriesChart')?.getContext('2d');
    
    if (ctx) {
        bidsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Bids Activity',
                    data: [],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
    
    if (catCtx) {
        categoriesChart = new Chart(catCtx, {
            type: 'doughnut',
            data: {
                labels: ['Electronics', 'Art', 'Collectibles', 'Fashion', 'Other'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
}

function updateChartData(products) {
    if (!bidsChart) return;
    
    // Generate last 7 days labels
    const labels = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString());
    }
    
    // Mock data - in production, you'd have real bid timestamps
    const data = labels.map(() => Math.floor(Math.random() * 50) + 10);
    
    bidsChart.data.labels = labels;
    bidsChart.data.datasets[0].data = data;
    bidsChart.update();
}

function updateChart() {
    if (bidsChart && allProducts) {
        updateChartData(allProducts);
    }
}

// ========== PRODUCTS ==========
async function loadProducts(reset = true) {
    if (!currentToken) return;
    if (reset) {
        currentPage = 1;
        hasMore = true;
        document.getElementById('productsList').innerHTML = '';
    }
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    showLoading(true);
    
    const sortBy = document.getElementById('sortBy')?.value || 'newest';
    const priceRange = document.getElementById('priceRange')?.value || 'all';
    const searchTerm = document.getElementById('searchInput')?.value || '';
    
    try {
        const response = await fetch(`/api/products`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            let filtered = data.data;
            
            // Apply search filter
            if (searchTerm) {
                filtered = filtered.filter(p => 
                    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    p.description.toLowerCase().includes(searchTerm.toLowerCase())
                );
            }
            
            // Apply price filter
            if (priceRange !== 'all') {
                const [min, max] = priceRange.split('-');
                if (max) {
                    filtered = filtered.filter(p => p.currentPrice >= min && p.currentPrice <= max);
                } else {
                    filtered = filtered.filter(p => p.currentPrice >= 1000);
                }
            }
            
            // Apply sorting
            switch(sortBy) {
                case 'newest':
                    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    break;
                case 'endingSoon':
                    filtered.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
                    break;
                case 'priceLow':
                    filtered.sort((a, b) => a.currentPrice - b.currentPrice);
                    break;
                case 'priceHigh':
                    filtered.sort((a, b) => b.currentPrice - a.currentPrice);
                    break;
                case 'mostBids':
                    filtered.sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0));
                    break;
            }
            
            displayPremiumProducts(filtered.slice(0, currentPage * 12));
            hasMore = filtered.length > currentPage * 12;
        }
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Error loading products', 'error');
    }
    
    isLoading = false;
    showLoading(false);
}

function displayPremiumProducts(products) {
    const container = document.getElementById('productsList');
    const isGridView = currentView === 'grid';
    
    container.className = isGridView ? 'products-grid premium-grid' : 'products-list premium-list';
    
    if (products.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-store"></i><p>No products found</p></div>';
        return;
    }
    
    container.innerHTML = products.map(product => {
        const timeLeft = moment(product.endTime).fromNow();
        const isEnding = moment(product.endTime).diff(moment(), 'hours') < 24;
        
        return `
            <div class="product-card-premium" onclick="loadProductDetail('${product._id}')">
                ${isEnding ? '<div class="product-badge">🔥 Ending Soon</div>' : ''}
                <div class="product-image-wrapper">
                    <img class="product-image" src="${product.imageUrl || 'https://via.placeholder.com/400x300?text=No+Image'}" alt="${escapeHtml(product.name)}">
                    <div class="product-overlay">
                        <div class="product-bid-count">
                            <i class="fas fa-gavel"></i> ${product.bidCount || 0} bids
                        </div>
                    </div>
                </div>
                <div class="product-content">
                    <h3 class="product-title">${escapeHtml(product.name)}</h3>
                    <div class="product-price">$${product.currentPrice}</div>
                    <div class="product-meta">
                        <span><i class="fas fa-user"></i> ${product.seller.name}</span>
                        <span><i class="fas fa-clock"></i> ${timeLeft}</span>
                    </div>
                    <div class="product-actions">
                        <button class="btn-bid-now" onclick="event.stopPropagation(); loadProductDetail('${product._id}')">
                            Place Bid <i class="fas fa-arrow-right"></i>
                        </button>
                        <button class="btn-watchlist" onclick="event.stopPropagation(); toggleWatchlist('${product._id}')">
                            <i class="fas ${watchlist.includes(product._id) ? 'fa-heart' : 'fa-heart-o'}"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function loadMoreProducts() {
    currentPage++;
    loadProducts(false);
}

function searchProducts() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadProducts(true);
    }, 500);
}

function setView(view) {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.view-btn').classList.add('active');
    loadProducts(true);
}

// ========== BIDDING ==========
async function placeBid(productId) {
    const amount = document.getElementById('bidAmount')?.value;
    
    if (!amount || amount <= 0) {
        showToast('Please enter a valid bid amount', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/products/${productId}/bid`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ amount: Number(amount) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('🎉 Bid placed successfully!', 'success');
            loadProductDetail(productId);
            loadProducts();
            loadDashboardData();
            
            // Add to activity feed
            addActivityToFeed(`You placed a bid of $${amount}`, 'bid');
        } else {
            showToast(data.message || 'Failed to place bid', 'error');
        }
    } catch (error) {
        showToast('Error placing bid', 'error');
    }
    
    showLoading(false);
}

// ========== WATCHLIST ==========
async function loadWatchlist() {
    const saved = localStorage.getItem(`watchlist_${currentUser?.id}`);
    watchlist = saved ? JSON.parse(saved) : [];
    updateWatchlistUI();
}

async function toggleWatchlist(productId) {
    const index = watchlist.indexOf(productId);
    if (index > -1) {
        watchlist.splice(index, 1);
        showToast('Removed from watchlist', 'info');
    } else {
        watchlist.push(productId);
        showToast('Added to watchlist', 'success');
        addActivityToFeed(`Added item to watchlist`, 'watch');
    }
    
    localStorage.setItem(`watchlist_${currentUser.id}`, JSON.stringify(watchlist));
    updateWatchlistUI();
    
    if (getCurrentPage() === 'watchlist') {
        loadWatchlistProducts();
    }
}

function updateWatchlistUI() {
    document.getElementById('watchlistCount').textContent = watchlist.length;
    if (watchlist.length > 0) {
        document.getElementById('watchlistCount').style.display = 'block';
    } else {
        document.getElementById('watchlistCount').style.display = 'none';
    }
}

async function loadWatchlistProducts() {
    if (!currentToken || watchlist.length === 0) {
        document.getElementById('watchlistList').innerHTML = '<div class="empty-state"><i class="fas fa-heart"></i><p>Your watchlist is empty</p></div>';
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/products', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            const watchlistProducts = data.data.filter(p => watchlist.includes(p._id));
            displayPremiumProducts(watchlistProducts);
        }
    } catch (error) {
        console.error('Error loading watchlist:', error);
    }
    
    showLoading(false);
}

// ========== MY PRODUCTS & BIDS ==========
async function loadMyProducts() {
    if (!currentToken) return;
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/products/my-products', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        if (data.success) {
            const container = document.getElementById('myProductsList');
            if (data.data.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-hammer"></i><p>You haven\'t listed any products yet</p><button class="btn-premium" onclick="showPage(\'createProduct\')">Create Auction</button></div>';
            } else {
                displayPremiumProducts(data.data);
            }
        }
    } catch (error) {
        console.error('Error loading my products:', error);
    }
    
    showLoading(false);
}

async function loadMyBids() {
    if (!currentToken) return;
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/products/my-bids', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        const container = document.getElementById('myBidsList');
        
        if (data.data.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-gavel"></i><p>You haven\'t placed any bids yet</p></div>';
        } else {
            container.innerHTML = data.data.map(bid => {
                if (!bid.product) return '';
                const isWinning = bid.product.highestBidder === currentUser.id;
                return `
                    <div class="bid-item-premium" onclick="loadProductDetail('${bid.product._id}')">
                        <div class="bid-item-image">
                            <img src="${bid.product.imageUrl || 'https://via.placeholder.com/80'}" alt="">
                        </div>
                        <div class="bid-item-info">
                            <h4>${escapeHtml(bid.product.name)}</h4>
                            <div class="bid-item-details">
                                <span>Your bid: $${bid.amount}</span>
                                <span>Current: $${bid.product.currentPrice}</span>
                                ${isWinning ? '<span class="winning-badge">🏆 Winning</span>' : '<span class="losing-badge">Outbid</span>'}
                            </div>
                        </div>
                        <div class="bid-item-status">
                            ${moment(bid.createdAt).fromNow()}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading my bids:', error);
    }
    
    showLoading(false);
}

// ========== CREATE PRODUCT ==========
async function handleCreateProduct(e) {
    e.preventDefault();
    
    const name = document.getElementById('productName').value;
    const description = document.getElementById('productDescription').value;
    const startingPrice = document.getElementById('productStartingPrice').value;
    const endTime = document.getElementById('productEndTime').value;
    const imageUrl = document.getElementById('productImageUrl').value;
    
    if (!name || !description || !startingPrice || !endTime) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                name,
                description,
                startingPrice: Number(startingPrice),
                endTime: new Date(endTime).toISOString(),
                imageUrl
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('🎉 Auction created successfully!', 'success');
            document.getElementById('createProductForm').reset();
            showPage('myProducts');
            loadMyProducts();
            loadDashboardData();
            
            // Emit socket event
            if (socket) {
                socket.emit('new-product', {
                    productId: data.data._id,
                    productName: name,
                    sellerName: currentUser.name
                });
            }
        } else {
            showToast(data.message || 'Failed to create product', 'error');
        }
    } catch (error) {
        showToast('Error creating product', 'error');
    }
    
    showLoading(false);
}

// ========== PRODUCT DETAIL MODAL ==========
async function loadProductDetail(productId) {
    if (!currentToken) return;
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/products/${productId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayPremiumProductModal(data.data, data.bids);
            socket.emit('join-product', productId);
            
            const modal = document.getElementById('productModal');
            modal.setAttribute('data-product-id', productId);
            modal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading product:', error);
        showToast('Error loading product details', 'error');
    }
    
    showLoading(false);
}

function displayPremiumProductModal(product, bids) {
    const modalContent = document.getElementById('productDetail');
    const isSeller = currentUser && product.seller._id === currentUser.id;
    const isEnded = new Date(product.endTime) < new Date();
    const isWatching = watchlist.includes(product._id);
    
    const timeLeft = moment(product.endTime).fromNow();
    
    modalContent.innerHTML = `
        <div class="product-detail-premium">
            <div class="detail-image">
                <img src="${product.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image'}" alt="${escapeHtml(product.name)}">
            </div>
            <div class="detail-info">
                <h1>${escapeHtml(product.name)}</h1>
                <div class="detail-meta">
                    <span class="seller"><i class="fas fa-user"></i> ${product.seller.name}</span>
                    <span class="time"><i class="fas fa-clock"></i> ${timeLeft}</span>
                </div>
                <div class="detail-description">
                    <h3>Description</h3>
                    <p>${escapeHtml(product.description)}</p>
                </div>
                <div class="detail-price">
                    <div class="current-price">
                        <span>Current Price</span>
                        <strong>$${product.currentPrice}</strong>
                    </div>
                    <div class="starting-price">
                        <span>Starting Price</span>
                        <strong>$${product.startingPrice}</strong>
                    </div>
                </div>
                
                ${!isSeller && !isEnded && product.isActive ? `
                    <div class="bid-input">
                        <input type="number" id="bidAmount" placeholder="Enter bid amount" step="1">
                        <button class="btn-bid-premium" onclick="placeBid('${product._id}')">
                            <i class="fas fa-gavel"></i> Place Bid
                        </button>
                    </div>
                ` : ''}
                
                <div class="detail-actions">
                    <button class="btn-watchlist-premium" onclick="toggleWatchlist('${product._id}')">
                        <i class="fas ${isWatching ? 'fa-heart' : 'fa-heart-o'}"></i>
                        ${isWatching ? 'Watchlisted' : 'Add to Watchlist'}
                    </button>
                    ${isSeller && !isEnded ? `
                        <button class="btn-end-auction" onclick="endAuction('${product._id}')">
                            <i class="fas fa-stop"></i> End Auction
                        </button>
                    ` : ''}
                </div>
                
                <div class="bid-history">
                    <h3>Bid History (${bids?.length || 0} bids)</h3>
                    <div class="bid-list">
                        ${bids && bids.length > 0 ? bids.map(bid => `
                            <div class="bid-history-item">
                                <div class="bidder-info">
                                    <strong>${escapeHtml(bid.bidder.name)}</strong>
                                    <span>${moment(bid.createdAt).fromNow()}</span>
                                </div>
                                <div class="bid-amount">$${bid.amount}</div>
                            </div>
                        `).join('') : '<p class="no-bids">No bids yet. Be the first!</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function closeModal() {
    const modal = document.getElementById('productModal');
    const productId = modal.getAttribute('data-product-id');
    if (productId && socket) {
        socket.emit('leave-product', productId);
    }
    modal.style.display = 'none';
}

async function endAuction(productId) {
    if (!confirm('Are you sure you want to end this auction early?')) return;
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/products/${productId}/end`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Auction ended successfully', 'success');
            closeModal();
            loadProducts();
            loadDashboardData();
        } else {
            showToast(data.message || 'Failed to end auction', 'error');
        }
    } catch (error) {
        showToast('Error ending auction', 'error');
    }
    
    showLoading(false);
}

// ========== ACTIVITY FEED ==========
function addActivityToFeed(message, type) {
    const feedItem = {
        id: Date.now(),
        message,
        type,
        time: new Date()
    };
    
    activityFeed.unshift(feedItem);
    if (activityFeed.length > 50) activityFeed.pop();
    
    updateActivityFeed();
}

function updateActivityFeed() {
    const container = document.getElementById('activityFeed');
    if (!container) return;
    
    if (activityFeed.length === 0) {
        container.innerHTML = '<div class="feed-loading">No activity yet</div>';
        return;
    }
    
    container.innerHTML = activityFeed.slice(0, 20).map(item => {
        let icon = '';
        switch(item.type) {
            case 'bid': icon = '<div class="feed-icon bid"><i class="fas fa-gavel"></i></div>'; break;
            case 'product': icon = '<div class="feed-icon product"><i class="fas fa-box"></i></div>'; break;
            case 'watch': icon = '<div class="feed-icon watch"><i class="fas fa-heart"></i></div>'; break;
            default: icon = '<div class="feed-icon"><i class="fas fa-bell"></i></div>';
        }
        
        return `
            <div class="feed-item">
                ${icon}
                <div class="feed-content">
                    <div class="feed-text">${escapeHtml(item.message)}</div>
                    <div class="feed-time">${moment(item.time).fromNow()}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ========== NOTIFICATIONS ==========
function addNotification(message, type) {
    const notification = {
        id: Date.now(),
        message,
        type,
        read: false,
        time: new Date()
    };
    
    notifications.unshift(notification);
    if (notifications.length > 20) notifications.pop();
    
    updateNotifications();
    document.getElementById('notificationDot').style.display = 'block';
}

function updateNotifications() {
    const container = document.getElementById('notificationList');
    const unreadCount = notifications.filter(n => !n.read).length;
    
    if (unreadCount > 0) {
        document.getElementById('notificationDot').style.display = 'block';
    } else {
        document.getElementById('notificationDot').style.display = 'none';
    }
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="notification-empty">No notifications</div>';
        return;
    }
    
    container.innerHTML = notifications.slice(0, 10).map(notif => `
        <div class="notification-item ${!notif.read ? 'unread' : ''}" onclick="markNotificationRead('${notif.id}')">
            <div class="notification-message">${escapeHtml(notif.message)}</div>
            <div class="notification-time">${moment(notif.time).fromNow()}</div>
        </div>
    `).join('');
}

function markNotificationRead(id) {
    const notif = notifications.find(n => n.id == id);
    if (notif) notif.read = true;
    updateNotifications();
}

function clearNotifications() {
    notifications = [];
    updateNotifications();
}

// ========== UI HELPERS ==========
function showPage(pageName) {
    const pages = ['dashboardPage', 'loginPage', 'signupPage', 'productsPage', 'myProductsPage', 'myBidsPage', 'watchlistPage', 'createProductPage', 'profilePage', 'analyticsPage'];
    pages.forEach(page => {
        const element = document.getElementById(page);
        if (element) element.style.display = 'none';
    });
    
    const targetPage = document.getElementById(`${pageName}Page`);
    if (targetPage) targetPage.style.display = 'block';
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    // Load page-specific data
    switch(pageName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'products':
            loadProducts();
            break;
        case 'myProducts':
            loadMyProducts();
            break;
        case 'myBids':
            loadMyBids();
            break;
        case 'watchlist':
            loadWatchlistProducts();
            break;
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getCurrentPage() {
    if (document.getElementById('dashboardPage').style.display !== 'none') return 'dashboard';
    if (document.getElementById('productsPage').style.display !== 'none') return 'products';
    if (document.getElementById('myProductsPage').style.display !== 'none') return 'myProducts';
    if (document.getElementById('myBidsPage').style.display !== 'none') return 'myBids';
    if (document.getElementById('watchlistPage').style.display !== 'none') return 'watchlist';
    return null;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    switch(type) {
        case 'success': icon = '<i class="fas fa-check-circle"></i>'; break;
        case 'error': icon = '<i class="fas fa-exclamation-circle"></i>'; break;
        case 'info': icon = '<i class="fas fa-info-circle"></i>'; break;
    }
    
    toast.innerHTML = `${icon} ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========== KEYBOARD SHORTCUTS ==========
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K - Focus search
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchInput')?.focus();
        }
        
        // Cmd/Ctrl + D - Dashboard
        if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
            e.preventDefault();
            if (currentToken) showPage('dashboard');
        }
        
        // Cmd/Ctrl + M - Marketplace
        if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
            e.preventDefault();
            if (currentToken) showPage('products');
        }
        
        // Cmd/Ctrl + B - My Bids
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            e.preventDefault();
            if (currentToken) showPage('myBids');
        }
        
        // Cmd/Ctrl + N - New Auction
        if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
            e.preventDefault();
            if (currentToken) showPage('createProduct');
        }
        
        // Cmd/Ctrl + / - Show shortcuts
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            showKeyboardShortcuts();
        }
        
        // Escape - Close modal
        if (e.key === 'Escape') {
            closeModal();
            closeShortcutsModal();
        }
    });
}

function showKeyboardShortcuts() {
    document.getElementById('shortcutsModal').style.display = 'block';
}

function closeShortcutsModal() {
    document.getElementById('shortcutsModal').style.display = 'none';
}

// ========== PASSWORD STRENGTH ==========
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('signupPassword');
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const strength = checkPasswordStrength(this.value);
            updateStrengthMeter(strength);
        });
    }
    
    // Character counter for description
    const descInput = document.getElementById('productDescription');
    if (descInput) {
        descInput.addEventListener('input', function() {
            const count = this.value.length;
            document.getElementById('charCount').textContent = count;
            if (count > 500) {
                this.value = this.value.substring(0, 500);
                document.getElementById('charCount').textContent = 500;
            }
        });
    }
});

function checkPasswordStrength(password) {
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/\d/)) strength++;
    if (password.match(/[^a-zA-Z\d]/)) strength++;
    return Math.min(strength, 5);
}

function updateStrengthMeter(strength) {
    const meter = document.querySelector('.strength-bar');
    const text = document.querySelector('.strength-text');
    
    if (!meter) return;
    
    const percentages = {0: '0%', 1: '20%', 2: '40%', 3: '60%', 4: '80%', 5: '100%'};
    const colors = {0: '#ef4444', 1: '#ef4444', 2: '#f59e0b', 3: '#f59e0b', 4: '#10b981', 5: '#10b981'};
    const labels = {0: 'Very Weak', 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong', 5: 'Very Strong'};
    
    meter.style.width = percentages[strength];
    meter.style.backgroundColor = colors[strength];
    text.textContent = labels[strength];
}

// ========== SETUP EVENT LISTENERS ==========
function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const createProductForm = document.getElementById('createProductForm');
    
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    if (createProductForm) createProductForm.addEventListener('submit', handleCreateProduct);
    
    // Password toggle
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                this.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    });
}

// Add slideOutRight animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
    
    .empty-state {
        text-align: center;
        padding: 60px 20px;
        background: var(--gray-100);
        border-radius: 20px;
    }
    
    .empty-state i {
        font-size: 4rem;
        color: var(--gray-400);
        margin-bottom: 16px;
    }
    
    .product-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
    }
    
    .btn-bid-now {
        flex: 1;
        padding: 8px 16px;
        background: var(--gradient-primary);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
    }
    
    .btn-watchlist {
        width: 40px;
        padding: 8px;
        background: var(--gray-200);
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
    }
    
    .btn-watchlist:hover {
        background: var(--danger);
        color: white;
    }
    
    .bid-item-premium {
        display: flex;
        gap: 16px;
        padding: 16px;
        background: var(--gray-100);
        border-radius: 16px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.3s;
    }
    
    .bid-item-premium:hover {
        transform: translateX(8px);
        box-shadow: var(--shadow-md);
    }
    
    .winning-badge {
        color: var(--success);
        font-weight: 600;
    }
    
    .losing-badge {
        color: var(--danger);
    }
    
    .product-detail-premium {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }
    
    .detail-image img {
        width: 100%;
        border-radius: 16px;
    }
    
    .btn-bid-premium {
        width: 100%;
        padding: 12px;
        background: var(--gradient-primary);
        color: white;
        border: none;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 16px;
    }
    
    @media (max-width: 768px) {
        .product-detail-premium {
            grid-template-columns: 1fr;
        }
    }
`;
document.head.appendChild(style);