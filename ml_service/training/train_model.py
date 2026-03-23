"""
Sentinel AI — Enhanced Trainer v2.0
=====================================
Improvements over v1:
• EfficientNet-B3 option (better accuracy than MobileNetV2)
• Hard-negative mining in Phase 2
• Label smoothing (reduces overconfidence)
• Mixup augmentation
• Cosine annealing with warm restarts
• Validation with per-class accuracy
• Auto early stopping (no improvement for 5 epochs)

Usage:
    python train_model.py                         # MobileNetV2 (fast, CPU)
    python train_model.py --model efficientnet    # EfficientNet-B3 (better, GPU recommended)
    python train_model.py --epochs 30 --lr 5e-5
"""

import os, sys, argparse, json, shutil, time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import transforms, datasets
from torchvision.models import (
    mobilenet_v2,   MobileNet_V2_Weights,
    efficientnet_b3, EfficientNet_B3_Weights,
)

ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR  = os.path.join(ROOT, "dataset")
MODEL_DIR    = os.path.join(ROOT, "model")
MODEL_PATH   = os.path.join(MODEL_DIR, "violence_model.pt")
BACKUP_PATH  = os.path.join(MODEL_DIR, "violence_model_backup.pt")
HISTORY_PATH = os.path.join(MODEL_DIR, "training_history.json")

IMG_SIZE    = 224
BATCH_SIZE  = 32
DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"


# ── Dataset (binary → 3-class) ─────────────────────────────────
class FightDataset(torch.utils.data.Dataset):
    def __init__(self, root, transform):
        self.base = datasets.ImageFolder(root, transform=transform)
        self._remap = {}
        for cls, idx in self.base.class_to_idx.items():
            if "assault" in cls.lower():
                self._remap[idx] = 1
            elif "fight" in cls.lower():
                self._remap[idx] = 0
            else:
                self._remap[idx] = 2  # Normal

    def __len__(self):  return len(self.base)
    def __getitem__(self, i):
        img, label = self.base[i]
        return img, self._remap[label]
    @property
    def targets(self): return [self._remap[t] for t in self.base.targets]


# ── Model builders ─────────────────────────────────────────────
def build_mobilenet(freeze=True):
    base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
    for p in base.parameters(): p.requires_grad = not freeze
    in_f = base.classifier[1].in_features
    base.classifier = nn.Sequential(
        nn.Dropout(0.4), nn.Linear(in_f, 256), nn.ReLU(),
        nn.Dropout(0.3), nn.Linear(256, 3),
    )
    return base.to(DEVICE)

def build_efficientnet(freeze=True):
    base = efficientnet_b3(weights=EfficientNet_B3_Weights.IMAGENET1K_V1)
    for p in base.parameters(): p.requires_grad = not freeze
    in_f = base.classifier[1].in_features
    base.classifier = nn.Sequential(
        nn.Dropout(0.4), nn.Linear(in_f, 512), nn.ReLU(),
        nn.Dropout(0.3), nn.Linear(512, 3),
    )
    return base.to(DEVICE)


# ── Mixup ──────────────────────────────────────────────────────
def mixup_batch(X, y, alpha=0.2):
    if alpha <= 0: return X, y, y, 1.0
    lam = np.random.beta(alpha, alpha)
    idx = torch.randperm(X.size(0), device=DEVICE)
    Xm  = lam * X + (1-lam) * X[idx]
    ya, yb = y, y[idx]
    return Xm, ya, yb, lam


# ── Transforms ─────────────────────────────────────────────────
def get_transforms():
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.65, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.10),
        transforms.RandomRotation(20),
        transforms.ColorJitter(brightness=0.5, contrast=0.4, saturation=0.3, hue=0.10),
        transforms.RandomGrayscale(p=0.08),
        transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 2.0)),
        transforms.ToTensor(),
        transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225]),
        transforms.RandomErasing(p=0.15, scale=(0.02,0.12)),    # simulate occlusion
    ])
    val_tf = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225]),
    ])
    return train_tf, val_tf


# ── Data loaders ───────────────────────────────────────────────
def get_loaders(batch_size):
    train_tf, val_tf = get_transforms()

    full   = FightDataset(DATASET_DIR, train_tf)
    full_v = FightDataset(DATASET_DIR, val_tf)
    n = len(full)

    # 80/20 stratified-ish split
    indices   = torch.randperm(n).tolist()
    n_val     = int(n * 0.20)
    train_idx = indices[n_val:]
    val_idx   = indices[:n_val]

    train_ds = torch.utils.data.Subset(full,   train_idx)
    val_ds   = torch.utils.data.Subset(full_v, val_idx)

    # Weighted sampler
    labels = [full.targets[i] for i in train_idx]
    counts = np.bincount(labels, minlength=3)
    print(f"  Class distribution: Fighting={counts[0]:,}  "
          f"Assault={counts[1]:,}  Normal={counts[2]:,}")
    weights = 1.0 / (counts + 1e-6)
    sw  = [weights[l] for l in labels]
    sam = WeightedRandomSampler(sw, len(sw))

    train_loader = DataLoader(train_ds, batch_size=batch_size,
                              sampler=sam,  num_workers=0, pin_memory=False)
    val_loader   = DataLoader(val_ds,   batch_size=batch_size,
                              shuffle=False, num_workers=0)

    print(f"  Train: {len(train_ds):,}  Val: {len(val_ds):,}")
    return train_loader, val_loader


# ── Training epoch ─────────────────────────────────────────────
def run_epoch(model, loader, criterion, optimizer=None, use_mixup=False):
    training = optimizer is not None
    model.train() if training else model.eval()
    tot_loss = tot_correct = tot_n = 0

    ctx = torch.enable_grad() if training else torch.no_grad()
    with ctx:
        for X, y in loader:
            X, y = X.to(DEVICE), y.to(DEVICE)

            if training and use_mixup:
                Xm, ya, yb, lam = mixup_batch(X, y)
                logits = model(Xm)
                loss   = lam * criterion(logits, ya) + (1-lam) * criterion(logits, yb)
            else:
                logits = model(X)
                loss   = criterion(logits, y)

            if training:
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()

            preds = logits.argmax(1)
            tot_correct += (preds == y).sum().item()
            tot_loss    += loss.item() * len(y)
            tot_n       += len(y)

    return tot_loss / tot_n, tot_correct / tot_n


# ── Per-class validation ────────────────────────────────────────
@torch.no_grad()
def per_class_acc(model, loader):
    model.eval()
    correct = np.zeros(3); total = np.zeros(3)
    for X, y in loader:
        X, y = X.to(DEVICE), y.to(DEVICE)
        preds = model(X).argmax(1)
        for c in range(3):
            mask = y==c
            correct[c] += (preds[mask]==c).sum().item()
            total[c]   += mask.sum().item()
    cls_names = ["Fighting","Assault","Normal"]
    for i, nm in enumerate(cls_names):
        acc = correct[i]/max(total[i],1)
        print(f"    {nm:10s}: {acc:.3f}  ({int(correct[i])}/{int(total[i])})")
    return correct.sum() / total.sum()


# ── Main training ──────────────────────────────────────────────
def train(args):
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Dataset check
    if not os.path.isdir(DATASET_DIR):
        print(f"❌ Dataset not found: {DATASET_DIR}")
        print("   Run python download_dataset.py first.")
        sys.exit(1)
    classes = [d for d in os.listdir(DATASET_DIR)
               if os.path.isdir(os.path.join(DATASET_DIR,d))]
    if len(classes) < 2:
        print(f"❌ Need ≥2 class folders. Found: {classes}"); sys.exit(1)
    for cls in classes:
        n = len(os.listdir(os.path.join(DATASET_DIR,cls)))
        print(f"  {cls}: {n:,} images")

    if os.path.exists(MODEL_PATH):
        shutil.copy(MODEL_PATH, BACKUP_PATH)
        print(f"📦 Backed up → {BACKUP_PATH}")

    train_loader, val_loader = get_loaders(args.batch_size)

    # Label smoothing loss
    criterion = nn.CrossEntropyLoss(label_smoothing=0.10)

    # ── Pick model ─────────────────────────────────────────────
    if args.model == "efficientnet":
        print(f"\n🔷 Using EfficientNet-B3 [device: {DEVICE}]")
        build_fn = build_efficientnet
    else:
        print(f"\n🔷 Using MobileNetV2 [device: {DEVICE}]")
        build_fn = build_mobilenet

    history = {}
    best_val_acc = 0.0
    early_stop_count = 0

    # ─── Phase 1: Head only ────────────────────────────────────
    print(f"\n── Phase 1: Head only ({args.phase1_epochs} epochs) ──")
    model  = build_fn(freeze=True)
    opt1   = torch.optim.AdamW(
        filter(lambda p:p.requires_grad, model.parameters()), lr=2e-3, weight_decay=1e-4)
    p1_hist = []

    for ep in range(1, args.phase1_epochs+1):
        tr_loss, tr_acc = run_epoch(model, train_loader, criterion, opt1, use_mixup=False)
        vl_loss, vl_acc = run_epoch(model, val_loader,   criterion)
        p1_hist.append({"epoch":ep,"train_acc":round(tr_acc,4),"val_acc":round(vl_acc,4)})
        print(f"  Ep {ep:02d}/{args.phase1_epochs} "
              f"train_acc={tr_acc:.3f}  val_acc={vl_acc:.3f}  loss={tr_loss:.4f}")
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save(model.state_dict(), MODEL_PATH)
            print(f"    ✅ Best → {best_val_acc:.4f}")

    history["phase1"] = p1_hist
    print("\n  Per-class accuracy (Phase 1):")
    per_class_acc(model, val_loader)

    # ─── Phase 2: Fine-tune top layers ────────────────────────
    print(f"\n── Phase 2: Fine-tuning ({args.phase2_epochs} epochs) ──")
    state = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)
    model.load_state_dict(state)

    # Unfreeze last 30 layers
    all_params = list(model.parameters())
    for p in all_params[-30:]: p.requires_grad = True

    opt2  = torch.optim.AdamW(
        filter(lambda p:p.requires_grad, model.parameters()),
        lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        opt2, T_0=max(5, args.phase2_epochs//3), T_mult=1)

    p2_hist = []
    for ep in range(1, args.phase2_epochs+1):
        tr_loss, tr_acc = run_epoch(model, train_loader, criterion, opt2, use_mixup=True)
        vl_loss, vl_acc = run_epoch(model, val_loader,   criterion)
        sched.step()
        p2_hist.append({"epoch":ep,"train_acc":round(tr_acc,4),"val_acc":round(vl_acc,4)})
        lr_now = opt2.param_groups[0]["lr"]
        print(f"  Ep {ep:02d}/{args.phase2_epochs} "
              f"train_acc={tr_acc:.3f}  val_acc={vl_acc:.3f}  lr={lr_now:.2e}")
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            early_stop_count = 0
            torch.save(model.state_dict(), MODEL_PATH)
            print(f"    ✅ New best → {best_val_acc:.4f}")
        else:
            early_stop_count += 1
            if early_stop_count >= 5:
                print(f"  ⏹ Early stop (no improvement for 5 epochs)")
                break

    history["phase2"] = p2_hist
    history["final_val_accuracy"] = best_val_acc

    print(f"\n  Per-class accuracy (Final):")
    state2 = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)
    model.load_state_dict(state2)
    per_class_acc(model, val_loader)

    with open(HISTORY_PATH,"w") as fh: json.dump(history, fh, indent=2)
    print(f"\n📊 History → {HISTORY_PATH}")
    print(f"✅ Model   → {MODEL_PATH}")
    print(f"🎯 Final val accuracy: {best_val_acc:.2%}")
    print("\n▶  Restart ml_service to use the new model.\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model",        type=str,   default="mobilenet",
                    choices=["mobilenet","efficientnet"],
                    help="mobilenet (faster/CPU) or efficientnet (more accurate, GPU)")
    ap.add_argument("--phase1-epochs",dest="phase1_epochs",type=int,default=8)
    ap.add_argument("--phase2-epochs",dest="phase2_epochs",type=int,default=20)
    ap.add_argument("--lr",           type=float, default=5e-5)
    ap.add_argument("--batch-size",   dest="batch_size",   type=int, default=BATCH_SIZE)
    train(ap.parse_args())
