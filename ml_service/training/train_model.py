"""
Sentinel AI — PyTorch MobileNetV2 Trainer
==========================================
Trains a violence classifier from the CCTV Fights Dataset frames.
Works on Python 3.14+ (no TensorFlow dependency).

Usage:
    python train_model.py
    python train_model.py --epochs 20 --lr 1e-4
"""

import os, sys, argparse, json, shutil, time
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import transforms, datasets
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights

# ── Paths ──────────────────────────────────────────────────────
ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR  = os.path.join(ROOT, "dataset")
MODEL_DIR    = os.path.join(ROOT, "model")
MODEL_PATH   = os.path.join(MODEL_DIR, "violence_model.pt")
BACKUP_PATH  = os.path.join(MODEL_DIR, "violence_model_backup.pt")
HISTORY_PATH = os.path.join(MODEL_DIR, "training_history.json")

IMG_SIZE    = 224
BATCH_SIZE  = 32
PHASE1_EP   = 10
PHASE2_EP   = 15
DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"


# ── Dataset mapping (binary → 3-class) ─────────────────────────
# Dataset has:  Fight/  Normal/
# Model outputs: 0=Fighting  1=Assault  2=Normal
# We map: Fight→0, Normal→2, Assault (slot 1) = 0 for binary dataset
BINARY_MAP = {"Fight": 0, "FightNormal": 2,
              "Fighting": 0, "Normal": 2}

class FightDataset(torch.utils.data.Dataset):
    """
    Wraps a torchvision ImageFolder and remaps 2-class labels to 3-class.
    Fight/Fighting → 0, Normal → 2, Assault → 1 (if present)
    """
    def __init__(self, root, transform):
        self.base = datasets.ImageFolder(root, transform=transform)
        self.classes  = self.base.classes
        self.class_to_idx = self.base.class_to_idx
        # Build remap dict
        self._remap = {}
        for cls, idx in self.base.class_to_idx.items():
            if "fight" in cls.lower() or "assault" in cls.lower():
                if "assault" in cls.lower():
                    self._remap[idx] = 1
                else:
                    self._remap[idx] = 0
            else:
                self._remap[idx] = 2

    def __len__(self):
        return len(self.base)

    def __getitem__(self, i):
        img, label = self.base[i]
        return img, self._remap[label]


def build_model(freeze_backbone: bool) -> nn.Module:
    base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
    for param in base.parameters():
        param.requires_grad = not freeze_backbone

    in_features = base.classifier[1].in_features
    base.classifier = nn.Sequential(
        nn.Dropout(0.3),
        nn.Linear(in_features, 256),
        nn.ReLU(),
        nn.Dropout(0.3),
        nn.Linear(256, 3),  # 3 classes
    )
    return base.to(DEVICE)


def get_loaders(batch_size: int):
    SCREEN_AUG = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.75, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.5, contrast=0.3,
                               saturation=0.3, hue=0.08),
        transforms.ToTensor(),
        transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225]),
    ])
    VAL_TRANSFORM = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225]),
    ])

    full_train = FightDataset(DATASET_DIR, SCREEN_AUG)
    full_val   = FightDataset(DATASET_DIR, VAL_TRANSFORM)

    # 80/20 split
    n = len(full_train)
    n_val   = int(n * 0.20)
    n_train = n - n_val
    indices = torch.randperm(n).tolist()
    train_idx = indices[:n_train]
    val_idx   = indices[n_train:]

    train_ds = torch.utils.data.Subset(full_train, train_idx)
    val_ds   = torch.utils.data.Subset(full_val,   val_idx)

    # Weighted sampler for class imbalance
    labels = [full_train.base.targets[i] for i in train_idx]
    class_counts = np.bincount([full_train._remap[l] for l in labels], minlength=3)
    class_weights = 1.0 / (class_counts + 1e-6)
    sample_weights = [class_weights[full_train._remap[labels[i]]]
                      for i in range(len(labels))]
    sampler = WeightedRandomSampler(sample_weights, len(sample_weights))

    train_loader = DataLoader(train_ds, batch_size=batch_size,
                              sampler=sampler, num_workers=0, pin_memory=False)
    val_loader   = DataLoader(val_ds,   batch_size=batch_size,
                              shuffle=False, num_workers=0)

    print(f"  Train: {len(train_ds):,}  Val: {len(val_ds):,}")
    print(f"  Classes: {full_train.classes}  → mapped to [0/1/2]")
    return train_loader, val_loader


def run_epoch(model, loader, criterion, optimizer=None):
    train = optimizer is not None
    model.train() if train else model.eval()
    total_loss = total_correct = total_n = 0

    ctx = torch.no_grad() if not train else torch.enable_grad()
    with ctx:
        for X, y in loader:
            X, y = X.to(DEVICE), y.to(DEVICE)
            logits = model(X)
            loss   = criterion(logits, y)
            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            preds = logits.argmax(dim=1)
            total_correct += (preds == y).sum().item()
            total_loss    += loss.item() * len(y)
            total_n       += len(y)

    return total_loss / total_n, total_correct / total_n


def train(args):
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Dataset check
    if not os.path.isdir(DATASET_DIR):
        print(f"❌  Dataset not found: {DATASET_DIR}")
        print("   Run:  python download_dataset.py  first.")
        sys.exit(1)
    classes = [d for d in os.listdir(DATASET_DIR)
               if os.path.isdir(os.path.join(DATASET_DIR, d))]
    if len(classes) < 2:
        print(f"❌  Need at least 2 class folders. Found: {classes}")
        sys.exit(1)
    for cls in classes:
        n = len(os.listdir(os.path.join(DATASET_DIR, cls)))
        print(f"  {cls}: {n:,} images")

    if os.path.exists(MODEL_PATH):
        shutil.copy(MODEL_PATH, BACKUP_PATH)
        print(f"📦 Backed up → {BACKUP_PATH}")

    train_loader, val_loader = get_loaders(args.batch_size)
    criterion = nn.CrossEntropyLoss()
    history   = {"phase1": {}, "phase2": {}}

    # ─── Phase 1: Head only ────────────────────────────────────
    print(f"\n🔷  PHASE 1 — Head only ({args.phase1_epochs} epochs) [device: {DEVICE}]")
    model = build_model(freeze_backbone=True)
    opt1  = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()),
                              lr=1e-3)
    best_val_acc = 0.0
    p1_acc_hist  = []

    for ep in range(1, args.phase1_epochs + 1):
        tr_loss, tr_acc = run_epoch(model, train_loader, criterion, opt1)
        vl_loss, vl_acc = run_epoch(model, val_loader,   criterion)
        p1_acc_hist.append(vl_acc)
        print(f"  Ep {ep:02d}/{args.phase1_epochs}  "
              f"train_loss={tr_loss:.4f}  train_acc={tr_acc:.3f}  "
              f"val_acc={vl_acc:.3f}")
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save(model.state_dict(), MODEL_PATH)

    print(f"  Phase 1 best val_acc: {best_val_acc:.4f}")
    history["phase1"]["val_accuracy"] = p1_acc_hist

    # ─── Phase 2: Fine-tune top layers ────────────────────────
    print(f"\n🔶  PHASE 2 — Fine-tuning ({args.phase2_epochs} epochs)")
    # Load best Phase 1 weights
    state = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)
    model.load_state_dict(state)

    # Unfreeze last 20 layers only
    all_layers = list(model.parameters())
    for param in all_layers[-20:]:
        param.requires_grad = True

    opt2 = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()),
                             lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt2, T_max=args.phase2_epochs)

    p2_acc_hist = []
    for ep in range(1, args.phase2_epochs + 1):
        tr_loss, tr_acc = run_epoch(model, train_loader, criterion, opt2)
        vl_loss, vl_acc = run_epoch(model, val_loader,   criterion)
        sched.step()
        p2_acc_hist.append(vl_acc)
        print(f"  Ep {ep:02d}/{args.phase2_epochs}  "
              f"train_loss={tr_loss:.4f}  train_acc={tr_acc:.3f}  "
              f"val_acc={vl_acc:.3f}")
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save(model.state_dict(), MODEL_PATH)
            print(f"    ✅ New best: {best_val_acc:.4f} → saved")

    history["phase2"]["val_accuracy"] = p2_acc_hist
    history["final_val_accuracy"]     = best_val_acc

    with open(HISTORY_PATH, "w") as fh:
        json.dump(history, fh, indent=2)
    print(f"\n📊 History → {HISTORY_PATH}")
    print(f"✅ Model  → {MODEL_PATH}")
    print(f"🎯 Final val accuracy: {best_val_acc:.2%}")
    print("\n▶  Restart ml_service (python app.py) to use the new model.\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase1-epochs", dest="phase1_epochs", type=int, default=PHASE1_EP)
    ap.add_argument("--phase2-epochs", dest="phase2_epochs", type=int, default=PHASE2_EP)
    ap.add_argument("--lr",            type=float, default=1e-4)
    ap.add_argument("--batch-size",    dest="batch_size", type=int, default=BATCH_SIZE)
    train(ap.parse_args())
